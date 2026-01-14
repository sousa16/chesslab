import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Switch } from "@/components/ui/switch";

describe("Switch Component", () => {
  it("should render switch element", () => {
    const { container } = render(<Switch />);
    const switchElement = container.querySelector('[role="switch"]');
    expect(switchElement).toBeInTheDocument();
  });

  it("should be unchecked by default", () => {
    const { container } = render(<Switch />);
    const switchElement = container.querySelector('[role="switch"]');
    expect(switchElement).toHaveAttribute("data-state", "unchecked");
  });

  it("should be checked when defaultChecked is true", () => {
    const { container } = render(<Switch defaultChecked />);
    const switchElement = container.querySelector('[role="switch"]');
    expect(switchElement).toHaveAttribute("data-state", "checked");
  });

  it("should toggle state when clicked", () => {
    const { container } = render(<Switch />);
    const switchElement = container.querySelector('[role="switch"]');

    expect(switchElement).toHaveAttribute("data-state", "unchecked");
    fireEvent.click(switchElement!);
    expect(switchElement).toHaveAttribute("data-state", "checked");
    fireEvent.click(switchElement!);
    expect(switchElement).toHaveAttribute("data-state", "unchecked");
  });

  it("should be disabled when disabled prop is true", () => {
    const { container } = render(<Switch disabled />);
    const switchElement = container.querySelector('[role="switch"]');
    expect(switchElement).toBeDisabled();
  });

  it("should handle onChange callback", () => {
    const handleChange = jest.fn();
    const { container } = render(<Switch onCheckedChange={handleChange} />);
    const switchElement = container.querySelector('[role="switch"]');

    fireEvent.click(switchElement!);
    expect(handleChange).toHaveBeenCalled();
  });

  it("should have proper CSS classes", () => {
    const { container } = render(<Switch />);
    const switchElement = container.querySelector('[role="switch"]');
    expect(switchElement).toHaveClass("peer", "inline-flex", "h-6", "w-11");
  });

  it("should have thumb element", () => {
    const { container } = render(<Switch />);
    const thumb = container.querySelector('[role="switch"] > span');
    expect(thumb).toBeInTheDocument();
  });
});
