import "@testing-library/jest-dom/vitest";

// jsdom has no scrollIntoView
Element.prototype.scrollIntoView = () => {};

// every test starts with no saved chats
beforeEach(() => localStorage.clear());
