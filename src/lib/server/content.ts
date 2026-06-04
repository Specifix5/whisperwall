import { readFile } from 'node:fs/promises';
import path from 'node:path';

const contentsRoot = path.join(process.cwd(), 'contents');
const renderedCache = new Map<string, Promise<string>>();

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function inlineMarkdown(value: string) {
	return escapeHtml(value)
		.replaceAll(/`([^`]+)`/g, '<code>$1</code>')
		.replaceAll(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replaceAll(/\*([^*]+)\*/g, '<em>$1</em>');
}

function splitTableRow(line: string) {
	return line
		.replace(/^\|/, '')
		.replace(/\|$/, '')
		.split('|')
		.map((cell) => cell.trim());
}

function isTableDivider(line: string) {
	return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);
}

function flushParagraph(parts: string[], output: string[]) {
	if (!parts.length) return;
	output.push(`<p>${inlineMarkdown(parts.join(' '))}</p>`);
	parts.length = 0;
}

function flushList(items: string[], output: string[]) {
	if (!items.length) return;
	output.push(`<ul>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`);
	items.length = 0;
}

function renderMarkdown(markdown: string) {
	const output: string[] = [];
	const paragraph: string[] = [];
	const listItems: string[] = [];
	const lines = markdown.split(/\r?\n/);

	for (let index = 0; index < lines.length; index += 1) {
		const rawLine = lines[index];
		const line = rawLine.trim();
		if (!line) {
			flushParagraph(paragraph, output);
			flushList(listItems, output);
			continue;
		}

		const nextLine = lines[index + 1]?.trim() ?? '';
		if (line.includes('|') && isTableDivider(nextLine)) {
			flushParagraph(paragraph, output);
			flushList(listItems, output);
			const headers = splitTableRow(line);
			const rows: string[][] = [];
			index += 2;
			while (index < lines.length) {
				const rowLine = lines[index].trim();
				if (!rowLine || !rowLine.includes('|')) {
					index -= 1;
					break;
				}
				rows.push(splitTableRow(rowLine));
				index += 1;
			}

			output.push(
				`<table><thead><tr>${headers
					.map((header) => `<th>${inlineMarkdown(header)}</th>`)
					.join('')}</tr></thead><tbody>${rows
					.map(
						(row) =>
							`<tr>${headers
								.map((_, cellIndex) => `<td>${inlineMarkdown(row[cellIndex] ?? '')}</td>`)
								.join('')}</tr>`
					)
					.join('')}</tbody></table>`
			);
			continue;
		}

		const heading = line.match(/^(#{1,3})\s+(.+)$/);
		if (heading) {
			flushParagraph(paragraph, output);
			flushList(listItems, output);
			const level = heading[1].length;
			output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
			continue;
		}

		const listItem = line.match(/^[-*]\s+(.+)$/);
		if (listItem) {
			flushParagraph(paragraph, output);
			listItems.push(listItem[1]);
			continue;
		}

		flushList(listItems, output);
		paragraph.push(line);
	}

	flushParagraph(paragraph, output);
	flushList(listItems, output);
	return output.join('\n');
}

function resolveContentPath(parts: string[]) {
	const resolved = path.join(contentsRoot, ...parts);
	const relative = path.relative(contentsRoot, resolved);
	if (relative.startsWith('..') || path.isAbsolute(relative))
		throw new Error('Invalid content path');
	return resolved;
}

async function renderContentFile(parts: string[]) {
	const filePath = resolveContentPath(parts);
	const cached = renderedCache.get(filePath);
	if (cached) return cached;

	const rendered = readFile(filePath, 'utf8').then(renderMarkdown);
	renderedCache.set(filePath, rendered);
	return rendered;
}

export function getGlobalRulesHtml() {
	return renderContentFile(['rules', '_global.md']);
}

export function getFaqHtml() {
	return renderContentFile(['faq.md']);
}

export function getBlotterHtml() {
	return renderContentFile(['blotter.md']);
}

export async function getBoardRulesHtml(boardCode: string) {
	try {
		return await renderContentFile(['rules', `${boardCode}.md`]);
	} catch {
		return getGlobalRulesHtml();
	}
}
