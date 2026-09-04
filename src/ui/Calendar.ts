/**
 * 月视图日历组件：支持日期区间选择（点起始 → 点结束），高亮区间。
 * 纯 DOM 实现，不依赖第三方库。
 */

import type { DateRange } from "../types";
import { toDateString } from "../core/dates";

const WEEKDAY_LABELS_MON = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKDAY_LABELS_SUN = ["日", "一", "二", "三", "四", "五", "六"];
const MONTH_LABELS = [
	"一月", "二月", "三月", "四月", "五月", "六月",
	"七月", "八月", "九月", "十月", "十一月", "十二月",
];

export class CalendarWidget {
	private viewYear: number;
	private viewMonth: number; // 0-based
	private start: Date | null = null;
	private end: Date | null = null;
	private selecting = false; // 是否已选定起点、正在等待终点
	private readonly onChange: (range: DateRange | null) => void;
	private readonly weekStartsOnMonday: boolean;
	private readonly containerEl: HTMLElement;

	constructor(
		containerEl: HTMLElement,
		weekStartsOnMonday: boolean,
		onChange: (range: DateRange | null) => void
	) {
		this.containerEl = containerEl;
		this.weekStartsOnMonday = weekStartsOnMonday;
		this.onChange = onChange;
		const now = new Date();
		this.viewYear = now.getFullYear();
		this.viewMonth = now.getMonth();
	}

	/** 获取当前选中的范围（未选起点则返回 null；仅选起点时返回单日） */
	getRange(): DateRange | null {
		if (!this.start) return null;
		const end = this.end ?? this.start;
		const [s, e] =
			this.start.getTime() <= end.getTime() ? [this.start, end] : [end, this.start];
		return { start: toDateString(s), end: toDateString(e) };
	}

	/** 由外部设置选中范围（用于快捷按钮回填） */
	setRange(range: DateRange | null): void {
		if (!range) {
			this.start = null;
			this.end = null;
			this.selecting = false;
		} else {
			this.start = this.parse(range.start);
			this.end = this.parse(range.end);
			this.selecting = false;
			this.viewYear = this.start.getFullYear();
			this.viewMonth = this.start.getMonth();
		}
		this.render();
	}

	private parse(s: string): Date {
		const [y, m, d] = s.split("-").map(Number);
		return new Date(y, m - 1, d);
	}

	private inSelectedRange(date: Date): boolean {
		if (!this.start) return false;
		const end = this.end ?? this.start;
		const s = this.start.getTime();
		const e = end.getTime();
		const lo = Math.min(s, e);
		const hi = Math.max(s, e);
		const t = date.getTime();
		return t >= lo && t <= hi;
	}

	private isSelectedEdge(date: Date): boolean {
		if (!this.start) return false;
		const same = (a: Date, b: Date) =>
			a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate();
		if (same(date, this.start)) return true;
		return this.end ? same(date, this.end) : false;
	}

	private handleDayClick(date: Date): void {
		if (!this.selecting) {
			// 第一次点击：设为起点，进入等待终点状态
			this.start = date;
			this.end = null;
			this.selecting = true;
		} else {
			// 第二次点击：设为终点，完成区间选择
			this.end = date;
			this.selecting = false;
		}
		this.render();
		this.onChange(this.getRange());
	}

	/** 切换到上一月/下一月，并清空选择 */
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

		// 头部：上月 / 标题 / 下月
		const header = el.createDiv({ cls: "tah-calendar-header" });
		const prevBtn = header.createEl("button", { text: "‹" });
		prevBtn.addClass("tah-calendar-nav");
		prevBtn.addEventListener("click", () => this.moveMonth(-1));
		header.createSpan({
			text: `${this.viewYear}年${MONTH_LABELS[this.viewMonth]}`,
			cls: "tah-calendar-title",
		});
		const nextBtn = header.createEl("button", { text: "›" });
		nextBtn.addClass("tah-calendar-nav");
		nextBtn.addEventListener("click", () => this.moveMonth(1));

		// 星期标题
		const weekdays = this.weekStartsOnMonday ? WEEKDAY_LABELS_MON : WEEKDAY_LABELS_SUN;
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
		const today = new Date();
		for (let day = 1; day <= daysInMonth; day++) {
			const date = new Date(this.viewYear, this.viewMonth, day);
			const cell = grid.createDiv({ cls: "tah-calendar-cell" });
			cell.setText(String(day));
			if (
				date.getFullYear() === today.getFullYear() &&
				date.getMonth() === today.getMonth() &&
				date.getDate() === today.getDate()
			) {
				cell.addClass("tah-calendar-today");
			}
			if (this.inSelectedRange(date)) {
				cell.addClass("tah-calendar-selected");
			}
			if (this.isSelectedEdge(date)) {
				cell.addClass("tah-calendar-edge");
			}
			cell.addEventListener("click", () => this.handleDayClick(date));
		}
	}
}
