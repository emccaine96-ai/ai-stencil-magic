import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Upload,
  Loader2,
  Download,
  ChevronsLeftRight,
  Settings,
  KeyRound,
  Sparkles,
  Archive,
  Zap,
  Paintbrush,
} from "lucide-react";
import logo from "@/assets/stencil-logo.png";
import { saveStencil } from "@/lib/vault";
import { MasterSuite } from "@/components/master-suite/MasterSuite";
import { runPlugin, BUILTIN_PLUGINS } from "@/lib/plugins";
import { processClassicalPro, type ClassicalProResult } from "@/lib/classical-pro-integration";
import { computeStencilMetrics, computeTattooability, type TattooabilityResult } from "@/lib/classical-engine/inspector";
// @ts-ignore — optional vectorization (imagetracerjs)
import { vectorizeLineLayer } from "@/lib/classical-engine/vectorize";
// @ts-ignore — ink style panel (optional add-on, collapsed by default)
import { InkStylePanel } from "@/components/InkStylePanel";
// @ts-ignore — font system (self-hosted Font Squirrel fonts)
import { injectSelfHostedFontFaces, preloadAllSelfHostedFonts } from "@/fonts/load-font";
import { renderLetteringToImageData } from "@/fonts/text-to-stencil";
import { toast } from "sonner";
import { CustomPromptPanel } from "@/components/CustomPromptPanel";
import { analyzePhoto, suggestTuning, type TuningSuggestion } from "@/lib/photo-analysis";
import { PhotoAnalysisBanner } from "@/components/PhotoAnalysisBanner";
import {
  type TouchUpGenConfig,
} from "@/lib/touch-up/session";
import { writeHandoff } from "@/lib/touch-up/handoff";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Create Stencil — AI Stencil Magic" },
      {
        name: "description",
        content:
          "Upload a photo and generate a professional tattoo stencil with 5-tier tonal layering.",
      },
    ],
  }),
  component: CreatePage,
});
