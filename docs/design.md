# Reading and accessibility design

[Full-page Figma design](https://www.figma.com/design/AryJLM12AgDtBEBbXdWwc3?node-id=2-30)

The page keeps its original single-column research layout, all 11 figures, all 13 tables, and the original data and measurement notes. A white background, navy text and controls, and the existing pastel chart/card colors provide the visual hierarchy.

Site-local overrides live in `style.css`; generated `primitives.css` and `semantic.css` remain unchanged. The navy overrides apply only to light mode, preserving the existing high-contrast palette.

Desktop body text is 18px, mobile body text 16px, and controls provide at least 44px of height. Detailed figures and tables scroll horizontally on narrow screens rather than shrinking their labels. `reader.js` makes overflowing containers keyboard reachable, provides scroll labels, and marks the current table-of-contents location.

Line charts combine their original colors and end labels with six distinct marker/dash signatures. Focus a line chart and use Left/Right, Home or End to inspect observed years; Escape dismisses the values. Keyboard navigation keeps the selected point and tooltip inside the visible viewport.

## Validation

- Main page: 11 figures, 13 tables, 25 headings, 18 cards and 15 references.
- Original named paragraphs and all table cell values match the source page.
- Desktop and 390px mobile layouts; no page-level horizontal overflow.
- Main and India/Korea pages in light and high-contrast modes.
- Alluvial, corpus and forest controls; graph keyboard navigation and tooltip bounds.
- JavaScript syntax for the application scripts and reader enhancements.

These checks document the tested behaviors; they are not a claim of complete accessibility certification.
