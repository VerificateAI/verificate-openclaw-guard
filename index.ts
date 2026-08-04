/**
 * verificate-guard — the trust layer for OpenClaw, as a hook plugin.
 *
 * Two hooks, so quality is structural rather than something the agent may skip:
 *   before_agent_finalize — gate the final answer. If Verificate REJECTS the code
 *                           in it, ask the harness for one more pass with the findings.
 *   before_tool_call       — (opt-in) validate code inside write/patch tool calls
 *                           before they touch disk; require approval on a reject.
 *
 * Calls the hosted Verificate MCP server directly (no separate `openclaw mcp add`
 * needed). Free tier: 25 validations/machine, no token. Set config.token to continue.
 *
 * Fail-OPEN by design: if Verificate is unreachable or errors, the answer is never
 * blocked — a guard that breaks the agent on a network hiccup is worse than no guard.
 */
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

const MCP_URL = "https://mcp.verificate.ai/mcp";

type GuardConfig = {
  token?: string;          // optional Verificate token; omit for the free tier
  gateCode?: boolean;      // gate final answers that contain code (default true)
  gateProse?: boolean;     // also gate prose answers as documents (default false)
  guardToolWrites?: boolean; // validate code in write/patch tool calls (default false)
  maxRevisions?: number;   // extra passes to request on a reject (default 2)
  timeoutMs?: number;      // per-validation network budget (default 20000)
};

type Verdict = { valid: boolean; issues: string[]; score?: number };

const CODE_FENCE = /```[\s\S]*?```/;
const WRITE_TOOLS = new Set([
  "apply_patch", "write_file", "create_file", "edit_file", "str_replace", "fs_write",
]);

async function validate(
  content: string,
  validationType: string,
  cfg: GuardConfig,
): Promise<Verdict | null> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cfg.token) headers["authorization"] = `Bearer ${cfg.token}`;
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "validate_ai_output", arguments: { ai_output: content, validation_type: validationType } },
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 20_000);
  try {
    const res = await fetch(MCP_URL, {
      method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal,
    });
    if (!res.ok) return null;                       // fail-open
    const rpc = await res.json();
    const sc = rpc?.result?.structuredContent;
    if (!sc || typeof sc.valid !== "boolean") return null;
    return { valid: sc.valid, issues: Array.isArray(sc.issues) ? sc.issues : [], score: sc.score };
  } catch {
    return null;                                    // fail-open on timeout/network
  } finally {
    clearTimeout(timer);
  }
}

export default definePluginEntry({
  id: "verificate-guard",
  name: "Verificate Guard",
  description: "Gate every OpenClaw answer and (optionally) every code-writing tool call through Verificate before you trust it.",
  register(api) {
    // ---- Gate the final answer -------------------------------------------
    api.on(
      "before_agent_finalize",
      async (event) => {
        const cfg: GuardConfig = (event as any).context?.pluginConfig ?? {};
        const answer = event.lastAssistantMessage;
        if (!answer || answer.length < 40) return;   // skip trivial replies

        const hasCode = CODE_FENCE.test(answer);
        let verdict: Verdict | null = null;
        if (hasCode && (cfg.gateCode ?? true)) {
          verdict = await validate(answer, "code_generation", cfg);
        } else if (!hasCode && cfg.gateProse) {
          verdict = await validate(answer, "documentation", cfg);
        } else {
          return;                                    // nothing to gate per config
        }

        if (!verdict || verdict.valid) return;       // approved or fail-open → continue
        const findings = verdict.issues.slice(0, 6).join("; ") || "quality below threshold";
        return {
          action: "revise" as const,
          reason: `Verificate rejected this answer: ${findings}`,
          retry: {
            instruction:
              "Verificate (an independent reality-gate reviewer) REJECTED your previous answer for: " +
              `${findings}. Fix every issue and produce a corrected answer. Tell the user, in one ` +
              "sentence, what was caught.",
            idempotencyKey: "verificate-guard",
            maxAttempts: cfg.maxRevisions ?? 2,
          },
        };
      },
      { priority: 40, timeoutMs: 25_000 },
    );

    // ---- Gate code-writing tool calls (opt-in) ---------------------------
    api.on(
      "before_tool_call",
      async (event) => {
        const cfg: GuardConfig = (event as any).context?.pluginConfig ?? {};
        if (!cfg.guardToolWrites) return;            // off by default
        if (!WRITE_TOOLS.has(event.toolName)) return;

        const params = event.params ?? {};
        const code = String(
          (params as any).content ?? (params as any).code ?? (params as any).new_str ?? "",
        );
        if (code.length < 40) return;

        const verdict = await validate(code, "code_generation", cfg);
        if (!verdict || verdict.valid) return;       // approved or fail-open → allow
        const findings = verdict.issues.slice(0, 4).join("; ") || "reality-gate reject";
        return {
          requireApproval: {
            title: `Verificate rejected this ${event.toolName}`,
            description: `Writing this code was flagged: ${findings}. Approve to write anyway.`,
            severity: "warning" as const,
            timeoutMs: 60_000,
            timeoutBehavior: "deny" as const,
          },
        };
      },
      { priority: 40, timeoutMs: 25_000 },
    );
  },
});
