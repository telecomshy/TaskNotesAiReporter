/**
 * 月视图日历组件：支持日期区间选择（点起始 → 点结束），高亮区间。
 * 纯 DOM 实现，不依赖第三方库。
 * 本类退化为渲染器：区间选择规则由 calendarSelection 拥有，这里只持有
 * 选择值与当前显示月份，把网格单元翻译成日字符串后向纯模块提问并画出来。
 * 已提交区间由调用方在构造时注入，快捷按钮改区间时由调用方重建本组件。
 */

import type { DateRange } from "../types";
import { toDateString } from "../core/dates";
import { calendarLabels, type UiLanguage, type Translator } from "../i18n";
import {
	clearRange as clearSelectionRange,
	clickDay,
	containsDay,
	emptySelection,
	isEdgeDay,
	rangeOf,
	selectionFromRange,
	type CalendarSelection,
} from "./calendarSelection";

export class CalendarWidget {
	private viewYear: number;
	private viewMonth: number; // 0-based
	private selection: CalendarSelection;
	private readonly onChange: (range: DateRange | null) => void;
	private readonly weekStartsOnMonday: boolean;
	private readonly t: Translator;
	private readonly language: UiLanguage;
	private readonly containerEl: HTMLElement;

	constructor(
		containerEl: HTMLElement,
		weekStartsOnMonday: boolean,
		t: Translator,
		language: UiLanguage,
		initialRange: DateRange | null,
		onChange: (range: DateRange | null) => void
	) {
		this.containerEl = containerEl;
		this.weekStartsOnMonday = weekStartsOnMonday;
		this.t = t;
		this.language = language;
		this.onChange = onChange;
		if (initialRange) {
			this.selection = selectionFromRange(initialRange);
			const [year, month] = this.parseView(initialRange.start);
			this.viewYear = year;
			this.viewMonth = month;
		} else {
			this.selection = emptySelection();
			const now = new Date();
			this.viewYear = now.getFullYear();
			this.viewMonth = now.getMonth();
		}
	}

	/** 清除选中范围，保留当前显示月份（清空区间时用）。 */
	clearRange(): void {
		this.selection = clearSelectionRange(this.selection);
		this.render();
	}

	/** 从 YYYY-MM-DD 解析出显示用的年与 0-based 月。 */
	private parseView(day: string): [number, number] {
		const [year, month] = day.split("-").map(Number);
		return [year, month - 1];
	}

	private handleDayClick(date: Date): void {
		this.selection = clickDay(this.selection, toDateString(date));
		this.render();
		this.onChange(rangeOf(this.selection));
	}

	/** 切换到上一月/下一月。只移动显示月份，不动选择。 */
	private moveMonth(delta: number): void {
		this.viewMonth += delta;
		if (this.viewMonth < 0) {
			this.viewMonth = 11;
			this.viewYear -= 1;
		} else if (this.viewMonth > 11) {
			this.viewMonth = 0;
			this.viewYear += 1;
		}
		this.render();
	}

	render(): void {
		const el = this.containerEl;
		el.empty();
		el.addClass("tah-calendar");

		const labels = calendarLabels(this.language);

		// 头部：上月 / 标题 / 下月
		const header = el.createDiv({ cls: "tah-calendar-header" });
		const prevBtn = header.createEl("button", { text: "‹" });
		prevBtn.addClass("tah-calendar-nav");
		prevBtn.addEventListener("click", () => this.moveMonth(-1));
		header.createSpan({
			text: this.t("calendar.title", {
				month: labels.months[this.viewMonth],
				year: this.viewYear,
			}),
			cls: "tah-calendar-title",
		});
		const nextBtn = header.createEl("button", { text: "›" });
		nextBtn.addClass("tah-calendar-nav");
		nextBtn.addEventListener("click", () => this.moveMonth(1));

		// 星期标题
		const weekdays = this.weekStartsOnMonday ? labels.weekdaysMonday : labels.weekdaysSunday;
		const weekdayRow = el.createDiv({ cls: "tah-calendar-weekdays" });
		for (const wd of weekdays) {
			weekdayRow.createSpan({ text: wd, cls: "tah-calendar-weekday" });
		}

		// 日期网格
		const grid = el.createDiv({ cls: "tah-calendar-grid" });

		const firstDay = new Date(this.viewYear, this.viewMonth, 1);
		let leadingOffset = firstDay.getDay(); // 0=Sun
		if (this.weekStartsOnMonday) {
			leadingOffset = (leadingOffset + 6) % 7; // 周一=0
		}
		const daysInMonth = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();

		// 前置空白
		for (let i = 0; i < leadingOffset; i++) {
			grid.createDiv({ cls: "tah-calendar-cell tah-calendar-empty" });
		}
		// 当月日期
		const today = toDateString(new Date());
		for (let day = 1; day <= daysInMonth; day++) {
			const date = new Date(this.viewYear, this.viewMonth, day);
			const dayString = toDateString(date);
			const cell = grid.createDiv({ cls: "tah-calendar-cell" });
			cell.setText(String(day));
			if (dayString === today) {
				cell.addClass("tah-calendar-today");
			}
			if (containsDay(this.selection, dayString)) {
				cell.addClass("tah-calendar-selected");
			}
			if (isEdgeDay(this.selection, dayString)) {
				cell.addClass("tah-calendar-edge");
			}
			cell.addEventListener("click", () => this.handleDayClick(date));
		}
	}
}
