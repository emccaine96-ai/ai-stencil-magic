import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — AI Stencil Magic" },
      { name: "description", content: "Privacy policy for AI Stencil Magic." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-semibold">Privacy policy</h1>
        <p className="text-sm text-muted-foreground">Privacy policy coming soon.</p>
        <Link to="/" className="inline-block text-sm underline">
          Back to the app
        </Link>
      </div>
    </main>
  );
}
