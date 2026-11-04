/**
 * 最小 fake DOM（测试专用）：覆盖 modelTab / modelPicker 渲染路径用到的
 * Obsidian DOM 扩展（createEl / createDiv / createSpan / addClass / toggleClass /
 * empty / setText / querySelector 等）。不做布局、不做事件冒泡，只做记录与查询。
 */

export interface CreateOpts {
	cls?: string | string[];
	text?: string;
	type?: string;
	attr?: Record<string, string>;
}

type Listener = (event?: unknown) => void;

export class FakeEl {
	readonly tag: string;
	readonly classes = new Set<string>();
	readonly children: FakeEl[] = [];
	parent: FakeEl | null = null;
	text = "";
	value = "";
	checked = false;
	disabled = false;
	label = "";
	title = "";
	attributes = new Map<string, string>();
	private readonly listeners = new Map<string, Listener[]>();

	constructor(tag = "div") {
		this.tag = tag;
	}

	// ===== 构造 =====

	createEl(tag: string, opts?: CreateOpts): FakeEl {
		const el = new FakeEl(tag);
		if (opts?.cls) {
			for (const cls of Array.isArray(opts.cls) ? opts.cls : [opts.cls]) el.addClass(cls);
		}
		if (opts?.text !== undefined) el.text = opts.text;
		if (opts?.type !== undefined) el.attributes.set("type", opts.type);
		if (opts?.attr) {
			for (const [k, v] of Object.entries(opts.attr)) el.attributes.set(k, v);
		}
		this.append(el);
		return el;
	}

	createDiv(opts?: CreateOpts): FakeEl {
		return this.createEl("div", opts);
	}

	createSpan(opts?: CreateOpts): FakeEl {
		return this.createEl("span", opts);
	}

	append(el: FakeEl): void {
		el.parent = this;
		this.children.push(el);
	}

	// ===== 类名 =====

	addClass(cls: string): void {
		this.classes.add(cls);
	}

	removeClass(cls: string): void {
		this.classes.delete(cls);
	}

	toggleClass(cls: string, force?: boolean): void {
		const on = force ?? !this.classes.has(cls);
		if (on) this.classes.add(cls);
		else this.classes.delete(cls);
	}

	hasClass(cls: string): boolean {
		return this.classes.has(cls);
	}

	// ===== 内容 =====

	empty(): void {
		for (const child of this.children) child.parent = null;
		this.children.length = 0;
	}

	setText(text: string): void {
		this.text = text;
	}

	setAttribute(name: string, value: string): void {
		this.attributes.set(name, value);
	}

	getAttribute(name: string): string | null {
		return this.attributes.get(name) ?? null;
	}

	get textContent(): string {
		return this.text;
	}

	set textContent(value: string) {
		this.text = value;
	}

	// ===== 事件 =====

	addEventListener(type: string, fn: Listener): void {
		const list = this.listeners.get(type) ?? [];
		list.push(fn);
		this.listeners.set(type, list);
	}

	/** 测试用：触发某类事件的全部监听器。 */
	fire(type: string, event?: unknown): void {
		for (const fn of this.listeners.get(type) ?? []) fn(event);
	}

	// ===== 查询（仅支持 ".cls" 简单选择器） =====

	querySelector(selector: string): FakeEl | null {
		const cls = selector.startsWith(".") ? selector.slice(1) : null;
		if (cls === null) throw new Error(`FakeEl.querySelector 仅支持类选择器：${selector}`);
		return this.findDescendant((el) => el.classes.has(cls));
	}

	querySelectorAll(selector: string): FakeEl[] {
		const cls = selector.startsWith(".") ? selector.slice(1) : null;
		if (cls === null) throw new Error(`FakeEl.querySelectorAll 仅支持类选择器：${selector}`);
		const out: FakeEl[] = [];
		this.visit((el) => {
			if (el.classes.has(cls)) out.push(el);
		});
		return out;
	}

	/** 测试用：按标签名收集后代。 */
	byTag(tag: string): FakeEl[] {
		const out: FakeEl[] = [];
		this.visit((el) => {
			if (el.tag === tag) out.push(el);
		});
		return out;
	}

	private findDescendant(match: (el: FakeEl) => boolean): FakeEl | null {
		for (const child of this.children) {
			if (match(child)) return child;
			const hit = child.findDescendant(match);
			if (hit) return hit;
		}
		return null;
	}

	private visit(fn: (el: FakeEl) => void): void {
		for (const child of this.children) {
			fn(child);
			child.visit(fn);
		}
	}
}
