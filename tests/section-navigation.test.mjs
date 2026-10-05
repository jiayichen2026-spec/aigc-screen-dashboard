import test from "node:test";
import assert from "node:assert/strict";
import { sectionAtPosition } from "../src/lib/section-navigation.ts";

test("页内高亮随实际位置前进和后退，不保留旧点击结果", () => {
  const sections = [
    { id: "overview", top: -600 },
    { id: "focus", top: 22 },
    { id: "performance", top: 500 },
  ];
  assert.equal(sectionAtPosition(sections, 40, "overview", false), "focus");
  assert.equal(sectionAtPosition(sections, 40, "performance", false), "focus");
  assert.equal(
    sectionAtPosition(
      sections.map((s) => ({ ...s, top: s.top + 700 })),
      40,
      "focus",
      false,
    ),
    "overview",
  );
});

test("桌面审核与设备同一行时，保留该行内的点击选择；从上方进入默认首项", () => {
  const row = [
    { id: "funnel", top: -700 },
    { id: "moderation", top: 22 },
    { id: "devices", top: 22 },
  ];
  assert.equal(sectionAtPosition(row, 40, "devices", false), "devices");
  assert.equal(sectionAtPosition(row, 40, "funnel", false), "moderation");
});

test("手机按纵向位置高亮，置顶目录偏移参与判断", () => {
  const sections = [
    { id: "moderation", top: -300 },
    { id: "devices", top: 72 },
    { id: "exceptions", top: 450 },
  ];
  assert.equal(sectionAtPosition(sections, 92, "moderation", false), "devices");
  assert.equal(
    sectionAtPosition(sections, 40, "moderation", false),
    "moderation",
  );
});

test("页面底部最后一节无法贴顶时仍能正确高亮；空页面安全回退", () => {
  assert.equal(
    sectionAtPosition(
      [
        { id: "devices", top: -20 },
        { id: "exceptions", top: 350 },
      ],
      40,
      "devices",
      true,
    ),
    "exceptions",
  );
  assert.equal(sectionAtPosition([], 40, "funnel", false), "overview");
});
