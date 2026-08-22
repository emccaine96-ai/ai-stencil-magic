import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, Check, Eye, EyeOff, KeyRound, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "AI Provider Settings — AI Stencil Magic" },
      { name: "description", content: "Manage your Gemini and OpenRouter API keys." },
    ],
  }),
  component: SettingsPage,
});

const GEMINI_KEY_STORAGE = "stencilmagic.gemini.key";
const OPENROUTER_KEY_STORAGE = "stencilmagic.openrouter.key";

type TestStatus = "idle" | "testing" | "success" | "error";

function ProviderCard(props: {
  title: string;
  description: string;
  helpUrl: string;
  helpLabel: string;
  storageKey: string;
  placeholder: string;
  onTest: (key: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const [saved, setSaved] = useState("");
  const [draft, setDraft] = useState("");
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState("");

  useEffect(() => {
    const k = typeof window !== "undefined" ? localStorage.getItem(props.storageKey) : null;
    if (k) setSaved(k);
  }, [props.storageKey]);

  function maskedPreview(key: string) {
    if (key.length <= 8) return "••••••••";
    return `${key.slice(0, 4)}${"•".repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
  }

  function save() {
    const v = draft.trim();
    if (!v) return;
    localStorage.setItem(props.storageKey, v);
    setSaved(v);
    setDraft("");
    setEditing(false);
    setTestStatus("idle");
    toast.success(`${props.title} key saved`);
  }

  function remove() {
    localStorage.removeItem(props.storageKey);
    setSaved("");
    setDraft("");
    setEditing(false);
    setTestStatus("idle");
    toast.success(`${props.title} key removed`);
  }

  async function test() {
    const keyToTest = editing || !saved ? draft.trim() : saved;
    if (!keyToTest) {
      toast.error("Enter a key first");
      return;
    }
    setTestStatus("testing");
    setTestMessage("");
    try {
      const result = await props.onTest(keyToTest);
      setTestStatus(result.ok ? "success" : "error");
      setTestMessage(result.message);
    } catch (e) {
      setTestStatus("error");
      setTestMessage(e instanceof Error ? e.message : "Test failed");
    }
  }

  const showForm = editing || !saved;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound size={18} className="text-primary" />
        <h3 className="font-bold text-lg">{props.title}</h3>
        {saved ? (
          <span className="ml-auto text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            Key saved
          </span>
        ) : (
          <span className="ml-auto text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            Not set
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{props.description}</p>
      <p className="text-xs text-muted-foreground">
        Stored only in your browser (localStorage) and sent directly to {props.title} — it never
        touches our servers.{" "}
        <a href={props.helpUrl} target="_blank" rel="noreferrer" className="text-primary underline">
          {props.helpLabel}
        </a>
      </p>

      {!showForm ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[140px] rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono text-muted-foreground">
            {maskedPreview(saved)}
          </div>
          <button
            onClick={() => setEditing(true)}
            className="rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:border-primary"
          >
            Update
          </button>
          <button
            onClick={remove}
            className="rounded-xl border border-destructive/40 text-destructive px-3 py-2 text-xs font-semibold hover:bg-destructive/10"
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <input
              type={show ? "text" : "password"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={props.placeholder}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary pr-9"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={show ? "Hide key" : "Show key"}
            >
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            onClick={save}
            disabled={!draft.trim()}
            className="rounded-xl bg-gradient-primary text-primary-foreground px-4 py-2 text-xs font-bold disabled:opacity-50"
          >
            Save
          </button>
          {editing ? (
            <button
              onClick={() => {
                setEditing(false);
                setDraft("");
              }}
              className="rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:border-primary"
            >
              Cancel
            </button>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={test}
          disabled={testStatus === "testing" || (!saved && !draft.trim())}
          className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:border-primary disabled:opacity-40"
        >
          {testStatus === "testing" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          Test Connection
        </button>
        {testStatus === "success" ? (
          <span className="flex items-center gap-1 text-xs text-primary font-medium">
            <Check size={14} /> {testMessage || "Working"}
          </span>
        ) : null}
        {testStatus === "error" ? (
          <span className="flex items-center gap-1 text-xs text-destructive font-medium">
            <X size={14} /> {testMessage || "Failed"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

async function testGemini(key: string): Promise<{ ok: boolean; message: string }> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
  );
  if (r.status === 400 || r.status === 401 || r.status === 403) {
    return { ok: false, message: "Invalid API key" };
  }
  if (!r.ok) return { ok: false, message: `Gemini responded with ${r.status}` };
  return { ok: true, message: "Key is valid" };
}

async function testOpenRouter(key: string): Promise<{ ok: boolean; message: string }> {
  const r = await fetch("https://openrouter.ai/api/v1/auth/key", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (r.status === 401 || r.status === 403) return { ok: false, message: "Invalid API key" };
  if (!r.ok) return { ok: false, message: `OpenRouter responded with ${r.status}` };
  return { ok: true, message: "Key is valid" };
}

function SettingsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="mx-auto max-w-2xl px-4 h-16 flex items-center gap-3">
          <Link to="/create" className="flex items-center gap-2 text-sm">
            <ChevronLeft size={18} /> Back
          </Link>
          <h1 className="font-extrabold text-lg ml-2">AI Provider Settings</h1>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <p className="text-sm text-muted-foreground">
          Add your own API keys to use OpenRouter or Gemini generation. Classical Pro needs no key
          — it runs entirely on your device.
        </p>
        <ProviderCard
          title="Gemini"
          description="Google's Gemini 2.5 Flash Image model — used for direct AI stencil generation."
          helpUrl="https://aistudio.google.com/apikey"
          helpLabel="Get a free Gemini key"
          storageKey={GEMINI_KEY_STORAGE}
          placeholder="Paste your Gemini API key"
          onTest={testGemini}
        />
        <ProviderCard
          title="OpenRouter"
          description="Routes AI generation through OpenRouter — useful as an alternate model source."
          helpUrl="https://openrouter.ai/keys"
          helpLabel="Get an OpenRouter key"
          storageKey={OPENROUTER_KEY_STORAGE}
          placeholder="Paste your OpenRouter API key"
          onTest={testOpenRouter}
        />
      </main>
    </div>
  );
}
