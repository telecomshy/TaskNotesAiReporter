/**
 * 「生成报告」按钮的状态规格。
 * 生成中：不显示文字、显示旋转图标、禁用；空闲：显示「生成报告」、可点击。
 * 纯函数，便于单元测试；DOM 渲染由调用方按此状态完成。
 */

export interface GenerateButtonState {
	/** 按钮文字（生成中为空字符串） */
	label: string;
	/** 是否显示旋转图标 */
	spinner: boolean;
	/** 是否禁用按钮 */
	disabled: boolean;
}

const IDLE_LABEL = "生成报告";

/** 生成中按钮的额外 class（用于 CSS 显示旋转图标） */
export const GENERATE_BTN_LOADING_CLASS = "tah-generate-btn-loading";

export function getGenerateButtonState(generating: boolean): GenerateButtonState {
	return generating
		? { label: "", spinner: true, disabled: true }
		: { label: IDLE_LABEL, spinner: false, disabled: false };
}

/** 把状态规格应用到按钮元素。 */
export function applyGenerateButtonState(
	btn: HTMLButtonElement,
	state: GenerateButtonState
): void {
	btn.textContent = state.label;
	btn.disabled = state.disabled;
	btn.classList.toggle(GENERATE_BTN_LOADING_CLASS, state.spinner);
}
