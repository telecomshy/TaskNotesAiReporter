# 规格：收敛 AI 客户端的重复请求机制

> 权威出处：GitHub issue [#30](https://github.com/telecomshy/TaskNotesAiReporter/issues/30)（`ready-for-agent`）。本文件是仓库内可被 `/code-review` 直接发现的副本。

_来源：`/improve-codebase-architecture` 巡览的候选 ②，经 `/grill-with-docs` 逼问定形。_

## Problem Statement

模型客户端有两个操作——拉取模型列表、发起对话补全——它们各自把同一套 HTTP 机制又写了一遍：合并可选 Bearer 认证头、套超时、把非 2xx 响应映射成结构化错误、从错误体里提取可读详情、再做成功解析。真正不同的只有 URL、方法/请求体与成功解析。

对维护者而言：改动认证、超时、错误映射或详情提取中的任何一项，都必须落在两处；两处会漂移，为一条路径写的测试不保护另一条。对使用插件的用户而言：两条路径的错误提示可能因漂移而不一致。

## Solution

在既有的可注入请求接缝之后，让一个 **AI 请求模块** 拥有这套共享机制；两个操作退化为薄适配器，各自只描述「请求什么」与「如何读取成功结果」。对外零行为变更。

## User Stories

1. As a plugin maintainer, I want a single place that builds the optional Bearer auth header, so that a change to token handling lands once.
2. As a plugin maintainer, I want a single place that sets the JSON content type for bodied requests, so that I never have to remember it per call site.
3. As a plugin maintainer, I want a single place that applies the timeout, so that timeout behavior is identical across operations.
4. As a plugin maintainer, I want a single place that maps non-2xx responses to structured errors, so that status handling cannot drift.
5. As a plugin maintainer, I want a single place that extracts server error detail, so that user-facing messages stay consistent.
6. As a plugin maintainer, I want the timeout to remain its own structured error, so that users see a timeout message rather than a generic network error.
7. As a plugin maintainer, I want an empty completion to remain distinguishable from a parse failure, so that users get the right message.
8. As an AFK implementing agent, I want the change's behavior fully observable through the existing public interface, so that I do not need to invent new seams to test it.
9. As an AFK implementing agent, I want test-first development to drive the shared module through that existing interface, so that the tests encode behavior rather than shape.
10. As a plugin user, I want the same class of failure (bad key, unreachable host, server error, timeout) to read the same way regardless of which operation hit it.
11. As a plugin user, I want raw server detail (untranslated external text) carried through on failures, so that I can diagnose the real cause.
12. As a future maintainer, I want to add a third operation by supplying its URL, method/body, and success parsing plus its own error code, so that I mostly reuse the auth/timeout/error plumbing instead of re-implementing it.
13. As a future maintainer, I want the transport seam's data types to live with the transport seam, so that the transport adapter no longer depends on the client module.
14. As a future maintainer, I want the request module to remain free of Obsidian, so that it stays unit-testable outside the plugin runtime.
15. As a reviewer, I want the existing public-interface tests to remain green and unchanged, so that the refactor is proven behavior-preserving.
16. As a reviewer, I want no new domain vocabulary and no new ADR added, because this is an internal reshaping with no user-visible rule change.
17. As a plugin maintainer, I want the operation-scoped error codes preserved, so that existing UI translations keep working without edits.
18. As a plugin user, I want a model-list failure (e.g. invalid key) to keep its models-specific message.
19. As a plugin user, I want a chat failure to keep its chat-specific message.
20. As a maintainer, I want the request module's timeout handling to use plain timers rather than window timers, so that it can run in the Node test environment.
21. As a maintainer, I want unchanged public function signatures, so that no caller in settings or the report modal needs to change.

## Implementation Decisions

- **New module**: an AI request module owns the shared mechanics behind a small interface: merge optional Bearer auth, add JSON content type when a body is present, apply the timeout, map non-2xx to a structured error, extract error detail, then call a caller-supplied parse for the success body.
- **Interface shape**: the module exposes one function taking (a) the operation and request description (operation kind, URL, method, optional body, API key, timeout), (b) a parse callback that turns the response body into the caller's result, and (c) the request function. It returns the parsed result.
- **Error-code strategy**: keep the existing operation-scoped codes by deriving them from the operation kind — network failure, non-2xx, and parse failure each get an operation-prefixed code. The timeout code and the empty-completion code are special-cased and pass through untouched. A structured error thrown by the parse callback passes through unchanged.
- **Transport types move to the request module**: the request-function type and its request/response shapes now live with the request seam; the transport adapter and the client import them from there. The client re-exports them where needed for compatibility.
- **Default request stays at the client boundary**: the client keeps defaulting the request function to the transport implementation. The request module takes the request function as a required argument, so it never statically depends on the transport (and therefore never on Obsidian). This honors ADR-0002.
- **Unchanged public surface**: the two operations and the connection test keep their current signatures; token clamping stays in the client.
- **No model change**: no new domain terms and no new ADR; the concern is internal. (ADR-0002's timeout pointer is updated to follow the timeout into the request module.)

## Testing Decisions

- **What makes a good test here**: assert externally observable behavior — the request that leaves the client (URL, method, headers, body) and the structured error or value that comes back — never the internal shape of the request module. Tests must survive renaming or inlining that module.
- **One seam**: the public AI client interface (model listing, chat completion, connection test). The adapter is the already-existing injected request function: the real transport in production, a fake in tests. Prior art is the existing client test suite, which mocks the transport module and asserts captured URL/method/headers/body plus error outcomes.
- **Coverage to add** at that seam: bodied requests carry the JSON content type; a parse failure surfaces a structured error; an empty completion stays its own error distinct from a parse failure. Existing assertions (Bearer present/absent, non-2xx carries server detail, structured errors pass through) act as the regression net.
- **No dedicated test file for the request module**: a second seam would couple tests to an internal module that the refactor could later remove or reshape.

## Out of Scope

- Streaming, embeddings, retries, and backoff policies.
- Changing any error code, its meaning, or the UI copy it maps to.
- Changing the max-token clamp.
- Any settings, UI, or report-generation behavior.
- The other architecture-review candidates and the follow-ups surfaced alongside this one.

## Further Notes

- **Constraint**: the request module stays free of Obsidian so it remains testable in Node — the same purity rule ADR-0002 established for the client.
- **Behavior-preserving except one visible delta**: error-detail truncation length is unified to 300 (the two call sites used 200 and 300), so a model-list error can now carry up to 300 characters of server detail instead of 200. No other user-visible path changes.
- **Related**: ADR-0002 (AI HTTP transport decoupled from Obsidian).
