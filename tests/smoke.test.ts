import { it, expect } from "vitest";
import { products } from "@/lib/catalogue";

it("catalogue loads", () => expect(products.length).toBeGreaterThan(100));
