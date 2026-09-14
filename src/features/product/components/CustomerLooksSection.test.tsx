import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CustomerLooksSection from "./CustomerLooksSection";

describe("CustomerLooksSection", () => {
  it("does not render a section when the product has no customer looks", () => {
    const { container } = render(<CustomerLooksSection productName="Bahar Dress" looks={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders a product-specific customer look that opens the supplied Instagram URL safely", () => {
    render(
      <CustomerLooksSection
        productName="Bahar Dress"
        looks={[
          {
            id: "1-customer-look",
            image: "/uploads/customer-bahar.webp",
            instagramUrl: "https://www.instagram.com/p/example/",
            customerName: "@ria_customer",
            location: "Edmonton, AB",
            altText: "Customer wearing the Bahar Dress at an event",
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Real Customers, Real Looks" })).toBeInTheDocument();
    expect(screen.getByAltText("Customer wearing the Bahar Dress at an event")).toHaveAttribute(
      "src",
      "/uploads/customer-bahar.webp",
    );

    const imageLink = screen.getByRole("link", {
      name: "View @ria_customer's Bahar Dress look on Instagram",
    });
    expect(imageLink).toHaveAttribute("href", "https://www.instagram.com/p/example/");
    expect(imageLink).toHaveAttribute("target", "_blank");
    expect(imageLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Edmonton, AB")).toBeInTheDocument();
  });
});
