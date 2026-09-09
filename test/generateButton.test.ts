import { test } from "node:test";
import assert from "node:assert/strict";
import { getGenerateButtonState } from "../src/ui/generateButton";

test("空闲状态：显示「生成报告」文字，可点击，无旋转图标", () => {
	assert.deepEqual(getGenerateButtonState(false), {
		label: "生成报告",
		spinner: false,
		disabled: false,
	});
});

test("生成中：不显示文字，显示旋转图标，且按钮禁用", () => {
	assert.deepEqual(getGenerateButtonState(true), {
		label: "",
		spinner: true,
		disabled: true,
	});
});
