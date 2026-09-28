import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusBadge from "../components/StatusBadge.jsx";

describe("StatusBadge", () => {
  it("renders accepted state", () => {
    render(<StatusBadge status="ACCEPTED" />);
    expect(screen.getByText("ACCEPTED")).toBeInTheDocument();
  });
  it("renders rejected state", () => {
    render(<StatusBadge status="REJECTED" />);
    expect(screen.getByText("REJECTED")).toBeInTheDocument();
  });
});
