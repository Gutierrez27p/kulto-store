import test from "node:test";
import assert from "node:assert/strict";
import { coverForHomeCategory } from "../src/home-category-covers.js";
test("manual family cover takes priority",()=>assert.equal(coverForHomeCategory({camisetas:"https://storage.example/a.webp"},"camisetas","existing.jpg"),"https://storage.example/a.webp"));
test("automatic product photo remains when cover not configured",()=>assert.equal(coverForHomeCategory({},"sudaderas","existing.jpg"),"existing.jpg"));
test("removing one cover does not affect another",()=>assert.equal(coverForHomeCategory({tote:"tote.jpg"},"camisetas","tee.jpg"),"tee.jpg"));
test("personalize is allowed without catalogue products",()=>assert.equal(coverForHomeCategory({personalizar:"cover.jpg"},"personalizar"),"cover.jpg"));
