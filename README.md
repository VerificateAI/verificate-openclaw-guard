# Verificate Guard — the trust layer for OpenClaw

ClawHub skills are powerful but untrusted — security audits keep finding prompt injection, malware and credential theft in community skills, and every AI answer sounds confident whether it's right or wrong. **Verificate Guard makes quality structural**: it hooks OpenClaw so every answer is verified before you see it, not something the agent may skip.

Two hooks:

- **`before_agent_finalize`** — before OpenClaw presents a final answer, if it contains code, Verificate runs it through 17 deterministic reality gates (mock/placeholder veto, invented-API checks, false-completion detection) + a frontier-model review. On a **reject**, the guard asks the harness for one more pass with the findings — the agent self-corrects before you ever see the bad answer.
- **`before_tool_call`** *(opt-in)* — validates code inside write/patch tool calls (`apply_patch`, `write_file`, …) *before they touch disk*, and requires your approval if the reality gates reject it.

Calls the hosted [Verificate MCP server](https://mcp.verificate.ai/mcp) directly — no separate `openclaw mcp add` needed. **Free tier: 25 validations per machine, no signup.**

## Measured — why the guard is worth the hook

A frontier model reviewing an answer's code in a natural workflow missed reward-gaming (`assert True`) and a hallucinated API in **0 of 6 runs each**. Verificate's gates catch both **6 / 6 — deterministically**. In production it has run 2,581 audited validations and guards the write-path of a 21M-entity source-cited knowledge base (98.6% cited, 100% licensed). Benchmark: https://github.com/Verificate-Dev/verificate-mcp-quickstart/blob/master/COMPARISON.md

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

## Install into OpenClaw

Clone into your OpenClaw plugins directory and enable it in config:

```bash
git clone https://github.com/Verificate-Dev/verificate-openclaw-guard \
  ~/.openclaw/plugins/verificate-guard
```

Then add the config block above (with `hooks.allowConversationAccess: true`) and restart the Gateway. Verify it loaded:

```bash
openclaw plugins list      # verificate-guard should appear
```

Ask OpenClaw to write a function with a mocked/placeholder body — the guard rejects it and asks the agent to fix before you see the answer.

---

# Verificate Guard — OpenClaw 的信任层（中文）

ClawHub 技能功能强大，但并不可信——安全审计反复在社区技能中发现提示注入、恶意软件与凭证窃取，而每一条 AI 答复无论对错都显得信心十足。**Verificate Guard 让质量成为结构性保障**：它挂钩 OpenClaw，在你看到答复之前先对其进行验证，而不是让智能体"可选地"跳过。

两个挂钩（hooks）：

- **`before_agent_finalize`** — 在 OpenClaw 呈交最终答复之前，若其中含有代码，Verificate 会运行 17 道确定性现实闸门（模拟/占位符否决、虚构 API 检测、虚假完成检测）+ 前沿模型评审。一旦**被拒**，本插件会要求模型带着问题清单再跑一遍——智能体在你看到坏答复之前就自我纠正。
- **`before_tool_call`**（可选开启）— 在写入/打补丁类工具调用（`apply_patch`、`write_file` 等）**落盘之前**验证其中的代码，若现实闸门拒绝则要求你确认。

直接调用托管的 [Verificate MCP 服务器](https://mcp.verificate.ai/mcp)——无需单独 `openclaw mcp add`。**免费额度：每台机器 25 次验证，无需注册。**

## 安装与启用

`before_agent_finalize` 会读取会话内容，因此 OpenClaw 要求操作者显式授权。在你的配置中：

```json
{
  "plugins": {
    "entries": {
      "verificate-guard": {
        "hooks": { "allowConversationAccess": true },
        "config": { "gateCode": true, "guardToolWrites": false }
      }
    }
  }
}
```

克隆到 OpenClaw 插件目录：

```bash
git clone https://github.com/Verificate-Dev/verificate-openclaw-guard \
  ~/.openclaw/plugins/verificate-guard
```

## 设计上的可信

- **失败即放行。** 若 Verificate 不可达或超时，你的答复**绝不会**被阻断——一个会因网络抖动而卡死智能体的守卫，比没有守卫更糟。
- **唯一外发** — `https://mcp.verificate.ai/mcp`，别无其他。只读：代码只被分析，绝不执行，绝不用于训练。开源，MIT。
- 现实闸门是**确定性的**——无法被提示注入过的答复"说服"，而这正是困扰不可信技能的失效模式。

隐私政策：https://verificate.ai/privacy
