# Verificate Guard — the trust layer for OpenClaw

ClawHub skills are powerful but untrusted — security audits keep finding prompt injection, malware and credential theft in community skills, and every AI answer sounds confident whether it's right or wrong. **Verificate Guard makes quality structural**: it hooks OpenClaw so every answer is verified before you see it, not something the agent may skip.

Two hooks:

- **`before_agent_finalize`** — before OpenClaw presents a final answer, if it contains code, Verificate runs it through 17 deterministic reality gates (mock/placeholder veto, invented-API checks, false-completion detection) + a frontier-model review. On a **reject**, the guard asks the harness for one more pass with the findings — the agent self-corrects before you ever see the bad answer.
- **`before_tool_call`** *(opt-in)* — validates code inside write/patch tool calls (`apply_patch`, `write_file`, …) *before they touch disk*, and requires your approval if the reality gates reject it.

Calls the hosted [Verificate MCP server](https://mcp.verificate.ai/mcp) directly — no separate `openclaw mcp add` needed. **Free tier: 25 validations per machine, no signup.**

## Install & enable

`before_agent_finalize` reads conversation content, so OpenClaw requires an explicit operator opt-in. In your config:

```json
{
  "plugins": {
    "entries": {
      "verificate-guard": {
        "hooks": { "allowConversationAccess": true },
        "config": {
          "gateCode": true,
          "guardToolWrites": false
        }
      }
    }
  }
}
```

## Config

| key | default | what |
|---|---|---|
| `token` | – | Optional Verificate token. Omit for the free tier; add one to continue past 25 ([trial](https://verificate.ai/auth/signup)). |
| `gateCode` | `true` | Gate final answers containing code. |
| `gateProse` | `false` | Also gate prose answers (validated as documents). |
| `guardToolWrites` | `false` | Validate code in write/patch tool calls; require approval on reject. |
| `maxRevisions` | `2` | Extra passes to request on a reject. |
| `timeoutMs` | `20000` | Per-validation budget; on timeout the guard **fails open**. |

## Trust by design

- **Fail-open.** If Verificate is unreachable or times out, your answer is **never** blocked — a guard that breaks the agent on a network hiccup is worse than no guard.
- **One egress only** — `https://mcp.verificate.ai/mcp`. Nothing else. Read-only: your code is analyzed, never executed, never trained on. Open source, MIT.
- The reality gates are **deterministic** — they can't be sweet-talked by a prompt-injected answer, which is exactly the failure mode plaguing untrusted skills.

Privacy: https://verificate.ai/privacy · All Verificate clients: https://github.com/Verificate-Dev/verificate-mcp-quickstart
