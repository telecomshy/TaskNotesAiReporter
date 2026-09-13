import { test } from "node:test";
import assert from "node:assert/strict";
import { getGenerateButtonState } from "../src/ui/generateButton";

test("空闲状态：采用传入的按钮文字，可点击，无旋转图标", () => {
	assert.deepEqual(getGenerateButtonState(false, "生成报告"), {
		label: "生成报告",
		spinner: false,
		disabled: false,
	});
});

test("生成中：不显示文字，显示旋转图标，且按钮禁用", () => {
	assert.deepEqual(getGenerateButtonState(true, "生成报告"), {
		label: "",
		spinner: true,
		disabled: true,
	});
});
