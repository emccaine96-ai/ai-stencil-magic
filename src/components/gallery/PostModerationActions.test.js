import { afterEach, expect, mock, test } from "bun:test";

let viewerId;
mock.module("react", () => ({
  useEffect: () => {},
  useState: (initial) => [initial === undefined ? viewerId : initial, () => {}],
}));
mock.module("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));
mock.module("sonner", () => ({ toast: {} }));
mock.module("lucide-react", () => ({ Flag: () => null, Ban: () => null, Loader2: () => null }));

const { PostModerationActions } = await import("./PostModerationActions");

afterEach(() => { viewerId = undefined; });

test("signed-in owners cannot report or block their own posts", () => {
  viewerId = "user-a";
  expect(PostModerationActions({ postId: "post-a", authorId: "user-a" })).toBeNull();
});

test("signed-in viewers can moderate another author's post", () => {
  viewerId = "user-a";
  expect(PostModerationActions({ postId: "post-b", authorId: "user-b" })).not.toBeNull();
});

test("signed-out viewers retain the existing sign-in-required actions", () => {
  viewerId = null;
  expect(PostModerationActions({ postId: "post-b", authorId: "user-b" })).not.toBeNull();
});

test("actions remain hidden until the viewer is known", () => {
  expect(PostModerationActions({ postId: "post-a", authorId: "user-a" })).toBeNull();
});