// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { openTermsDialog, renderTermsLink } from "../../src/terms";

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

it("renders a footer link that opens the terms dialog when clicked", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const link = renderTermsLink(container);
  expect(link.textContent).toBe("服務使用條款");
  expect(container.querySelector(".nlsc-terms-footer")).toBeTruthy();
  expect(document.querySelector(".nlsc-modal-backdrop")).toBeNull();

  link.click();

  const backdrop = document.querySelector(".nlsc-modal-backdrop");
  expect(backdrop).toBeTruthy();
  const title = document.querySelector(".nlsc-modal-title");
  expect(title?.textContent).toBe("服務使用條款");
  // Body contains the core attribution clause taken from NLSC's own TOS.
  const body = document.querySelector(".nlsc-modal-body");
  expect(body?.textContent).toContain("國土測繪中心");
  expect(body?.textContent).toContain("不得大量下載內容");
});

it("close button removes the dialog", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  renderTermsLink(container).click();

  const closeBtn = document.querySelector(".nlsc-modal-close") as HTMLButtonElement;
  expect(closeBtn).toBeTruthy();
  closeBtn.click();
  expect(document.querySelector(".nlsc-modal-backdrop")).toBeNull();
});

it("clicking on the backdrop closes the dialog, but clicking inside does not", () => {
  openTermsDialog();

  const modal = document.querySelector(".nlsc-modal") as HTMLElement;
  modal.click();
  expect(document.querySelector(".nlsc-modal-backdrop")).toBeTruthy();

  const backdrop = document.querySelector(".nlsc-modal-backdrop") as HTMLElement;
  backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  // Synthetic click without a target inside modal — backdrop's listener checks
  // e.target === backdrop, so we dispatch directly on the backdrop element.
  expect(document.querySelector(".nlsc-modal-backdrop")).toBeNull();
});

it("Escape key closes the dialog", () => {
  openTermsDialog();
  expect(document.querySelector(".nlsc-modal-backdrop")).toBeTruthy();

  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(document.querySelector(".nlsc-modal-backdrop")).toBeNull();
});

it("does not open a second dialog if one is already open", () => {
  openTermsDialog();
  openTermsDialog();
  expect(document.querySelectorAll(".nlsc-modal-backdrop").length).toBe(1);
});
