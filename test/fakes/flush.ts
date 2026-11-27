/**
 * 等一轮宏任务：让已排队 Promise 的 catch 反应跑完。
 *
 * 落盘（owner.apply 交回的 save Promise）是异步的，门面在 catch 里统一上报；
 * 断言上报前先 `await flush()`。`test/fetchGate.test.ts` 的 5ms 变体等的是更长的
 * 异步链，语义不同，保留在本地。
 */
export function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
