import "@testing-library/jest-dom/vitest";

// jsdom has no scrollIntoView
Element.prototype.scrollIntoView = () => {};
