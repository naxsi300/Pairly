import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UpgradeModal } from "./UpgradeModal";
import { COPY } from "../copy";

describe("UpgradeModal", () => {
  it("renders the warm upgrade-soon copy when open", () => {
    render(<UpgradeModal open onClose={() => {}} />);
    // The dialog title must announce the soon-coming copy (warm tone).
    expect(
      screen.getByRole("dialog", { name: COPY.common.upgradeSoon }),
    ).toBeTruthy();
  });

  it("uses the provided title override when supplied", () => {
    render(<UpgradeModal open onClose={() => {}} title="Свой заголовок" />);
    expect(
      screen.getByRole("dialog", { name: "Свой заголовок" }),
    ).toBeTruthy();
  });

  it("renders only the 'Ладно' ghost button when no onDeleteOld handler is provided", () => {
    render(<UpgradeModal open onClose={() => {}} />);
    expect(screen.getByText(COPY.common.upgradeOK)).toBeTruthy();
    // No "Убрать старое" CTA without a handler — keeps the modal honest.
    expect(screen.queryByText(COPY.common.deleteOld)).toBeNull();
  });

  it("renders both 'Убрать старое' submit and 'Ладно' ghost when onDeleteOld is provided", () => {
    render(<UpgradeModal open onClose={() => {}} onDeleteOld={() => {}} />);
    expect(screen.getByText(COPY.common.deleteOld)).toBeTruthy();
    expect(screen.getByText(COPY.common.upgradeOK)).toBeTruthy();
  });

  it("calls onDeleteOld when the 'Убрать старое' submit button is clicked", () => {
    const onDeleteOld = vi.fn();
    render(<UpgradeModal open onClose={() => {}} onDeleteOld={onDeleteOld} />);
    fireEvent.click(screen.getByText(COPY.common.deleteOld));
    expect(onDeleteOld).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the 'Ладно' ghost button is clicked", () => {
    const onClose = vi.fn();
    render(<UpgradeModal open onClose={onClose} />);
    fireEvent.click(screen.getByText(COPY.common.upgradeOK));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render anything when closed", () => {
    render(<UpgradeModal open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});