// index.ts
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
var MCP_URL = "https://mcp.verificate.ai/mcp";
var CODE_FENCE = /```[\s\S]*?```/;
var WRITE_TOOLS = /* @__PURE__ */ new Set([
  "apply_patch",
  "write_file",
  "create_file",
  "edit_file",
  "str_replace",
  "fs_write"
]);
async function validate(content, validationType, cfg) {
  const headers = { "content-type": "application/json" };
  if (cfg.token) headers["authorization"] = `Bearer ${cfg.token}`;
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "validate_ai_output", arguments: { ai_output: content, validation_type: validationType } }
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 2e4);
  try {
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!res.ok) return null;
    const rpc = await res.json();
    const sc = rpc?.result?.structuredContent;
    if (!sc || typeof sc.valid !== "boolean") return null;
    return { valid: sc.valid, issues: Array.isArray(sc.issues) ? sc.issues : [], score: sc.score };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
var index_default = definePluginEntry({
  id: "verificate-guard",
  name: "Verificate Guard",
  description: "Gate every OpenClaw answer and (optionally) every code-writing tool call through Verificate before you trust it.",
  register(api) {
    api.on(
      "before_agent_finalize",
      async (event) => {
        const cfg = event.context?.pluginConfig ?? {};
        const answer = event.lastAssistantMessage;
        if (!answer || answer.length < 40) return;
        const hasCode = CODE_FENCE.test(answer);
        let verdict = null;
        if (hasCode && (cfg.gateCode ?? true)) {
          verdict = await validate(answer, "code_generation", cfg);
        } else if (!hasCode && cfg.gateProse) {
          verdict = await validate(answer, "documentation", cfg);
        } else {
          return;
        }
        if (!verdict || verdict.valid) return;
        const findings = verdict.issues.slice(0, 6).join("; ") || "quality below threshold";
        return {
          action: "revise",
          reason: `Verificate rejected this answer: ${findings}`,
          retry: {
            instruction: `Verificate (an independent reality-gate reviewer) REJECTED your previous answer for: ${findings}. Fix every issue and produce a corrected answer. Tell the user, in one sentence, what was caught.`,
            idempotencyKey: "verificate-guard",
            maxAttempts: cfg.maxRevisions ?? 2
          }
        };
      },
      { priority: 40, timeoutMs: 25e3 }
    );
    api.on(
      "before_tool_call",
      async (event) => {
        const cfg = event.context?.pluginConfig ?? {};
        if (!cfg.guardToolWrites) return;
        if (!WRITE_TOOLS.has(event.toolName)) return;
        const params = event.params ?? {};
        const code = String(
          params.content ?? params.code ?? params.new_str ?? ""
        );
        if (code.length < 40) return;
        const verdict = await validate(code, "code_generation", cfg);
        if (!verdict || verdict.valid) return;
        const findings = verdict.issues.slice(0, 4).join("; ") || "reality-gate reject";
        return {
          requireApproval: {
            title: `Verificate rejected this ${event.toolName}`,
            description: `Writing this code was flagged: ${findings}. Approve to write anyway.`,
            severity: "warning",
            timeoutMs: 6e4,
            timeoutBehavior: "deny"
          }
        };
      },
      { priority: 40, timeoutMs: 25e3 }
    );
  }
});
export {
  index_default as default
};
