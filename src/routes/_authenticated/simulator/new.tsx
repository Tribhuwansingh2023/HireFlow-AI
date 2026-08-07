import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Camera, CheckCircle2, Loader2, Mic, ShieldCheck, Signal, Sun, XCircle } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/ui-kit";
import { WaveMeter } from "@/components/interview-visuals";
import { Button } from "@/components/ui/button";
import { startInterviewSession } from "@/lib/interview.functions";
import { ROUND_LABEL, type RoundType } from "@/lib/interview";
import {
  VoiceRecorder,
  frameBrightness,
  networkQuality,
  requestMedia,
  stopStream,
} from "@/lib/media";

type Search = {
  candidateId: string;
  applicationId?: string | undefined;
  roundType: string;
  difficulty: string;
  companyType: string;
  planned: number;
};

export const Route = createFileRoute("/_authenticated/simulator/new")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    candidateId: String(search["candidateId"] ?? ""),
    applicationId: search["applicationId"] ? String(search["applicationId"]) : undefined,
    roundType: String(search["roundType"] ?? "technical"),
    difficulty: String(search["difficulty"] ?? "standard"),
    companyType: String(search["companyType"] ?? "product"),
    planned: Number(search["planned"] ?? 6),
  }),
  head: () => ({
    meta: [
      { title: "Device check — AI Interview Simulator" },
      {
        name: "description",
        content: "Verify camera, microphone, lighting and network quality before starting an AI interview round.",
      },
      { property: "og:title", content: "Device check — AI Interview Simulator" },
      { property: "og:description", content: "Camera, microphone, lighting and network readiness check." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeviceCheck,
});

function DeviceCheck() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<VoiceRecorder | null>(null);

  const [camera, setCamera] = useState(false);
  const [microphone, setMicrophone] = useState(false);
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [lighting, setLighting] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const network = typeof navigator === "undefined" ? "unknown" : networkQuality();

  const start = useServerFn(startInterviewSession);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    (async () => {
      try {
        const stream = await requestMedia();
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        setCamera(stream.getVideoTracks().length > 0);
        setMicrophone(stream.getAudioTracks().length > 0);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        const rec = new VoiceRecorder();
        rec.start(stream, (l) => {
          setLevel(l);
          setPeak((p) => Math.max(p, l));
        });
        recorderRef.current = rec;
        interval = setInterval(() => {
          if (videoRef.current) setLighting(frameBrightness(videoRef.current));
        }, 900);
      } catch {
        setError("We could not access your camera and microphone. Grant permission and reload this page.");
      }
    })();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      void recorderRef.current?.stop().catch(() => undefined);
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  const lightingOk = lighting >= 22;
  const micOk = peak >= 8;
  const ready = camera && microphone && lightingOk;

  async function beginInterview() {
    setStarting(true);
    try {
      const { sessionId } = await start({
        data: {
          candidateId: search.candidateId,
          applicationId: search.applicationId ?? null,
          roundType: search.roundType,
          difficulty: search.difficulty,
          companyType: search.companyType,
          plannedQuestions: search.planned,
          deviceCheck: {
            camera,
            microphone,
            micPeak: peak,
            lighting,
            network,
            checkedAt: new Date().toISOString(),
          },
        },
      });
      toast.success("Interview room ready");
      void navigate({ to: "/simulator/$sessionId", params: { sessionId } });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start the interview.");
      setStarting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pre-flight"
        title="Device & environment check"
        description={`${ROUND_LABEL[search.roundType as RoundType] ?? search.roundType} · ${search.difficulty} difficulty · ${search.planned} adaptive questions. Nothing is recorded until you start the interview.`}
      />

      {error ? (
        <div className="panel border-destructive/30 p-5 text-sm text-destructive">{error}</div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="panel overflow-hidden p-0">
          <div className="relative aspect-video w-full bg-black">
            <video ref={videoRef} muted playsInline className="size-full object-cover" />
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
            <div className="absolute bottom-3 left-3 rounded-full border border-white/15 bg-black/50 px-3 py-1 text-[11px] text-white/80 backdrop-blur">
              Preview only — not recording
            </div>
          </div>
        </div>

        <div className="panel space-y-4 p-5">
          <CheckRow ok={camera} icon={<Camera className="size-4" />} label="Camera" detail={camera ? "Connected" : "Not detected"} />
          <CheckRow
            ok={microphone}
            icon={<Mic className="size-4" />}
            label="Microphone"
            detail={micOk ? "Voice detected" : "Say a few words to test"}
          />
          <div className="rounded-xl border border-border/60 bg-card/40 p-3">
            <p className="mb-2 text-[11px] text-muted-foreground">Input level</p>
            <WaveMeter level={level} active={microphone} />
          </div>
          <CheckRow
            ok={lightingOk}
            icon={<Sun className="size-4" />}
            label="Lighting"
            detail={`${lighting}% brightness${lightingOk ? "" : " — move to a brighter spot"}`}
          />
          <CheckRow ok icon={<Signal className="size-4" />} label="Network" detail={network} />

          <div className="rounded-xl border border-border/60 bg-card/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mb-1 size-3.5 text-primary" />
            Audio is transcribed and webcam frames are analysed for engagement signals only. Assessments never consider
            appearance, age, gender or any protected attribute, and every score is written to the audit trail.
          </div>

          <Button className="w-full gap-2" disabled={!ready || starting} onClick={() => void beginInterview()}>
            {starting ? <Loader2 className="size-4 animate-spin" /> : null}
            {starting ? "Preparing your first question…" : "Start AI interview"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CheckRow({
  ok,
  icon,
  label,
  detail,
}: {
  ok: boolean;
  icon: React.ReactNode;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">{icon}</span>
        <div>
          <p className="text-sm text-foreground">{label}</p>
          <p className="text-[11px] text-muted-foreground">{detail}</p>
        </div>
      </div>
      {ok ? (
        <CheckCircle2 className="size-4 text-success" />
      ) : (
        <XCircle className="size-4 text-muted-foreground" />
      )}
    </div>
  );
}
