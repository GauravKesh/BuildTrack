"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Play,
  CheckCircle2,
  Zap,
  Sparkles,
  Trash2,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SeverityBadge } from "@/components/common/SeverityBadge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { apiClient } from "@/lib/api/client";
import { normalizeList } from "@/lib/utils";
import { useProjectStore } from "@/stores/projectStore";
import { useAuthStore } from "@/stores/authStore";
import { hasRole } from "@/lib/rbac";
import { toast } from "sonner";

interface RuleItem {
  id: string;
  name: string;
  sensor_type: string;
  operator: string;
  threshold_val1?: number;
  threshold_val2?: number | null;
  threshold?: number; // fallback for mock
  unit?: string;
  duration_seconds?: number;
  duration_minutes?: number; // fallback for mock
  severity: "critical" | "warning" | "info";
  is_enabled?: boolean;
  is_active?: boolean; // fallback for mock
  cooldown_seconds?: number;
  auto_create_incident?: boolean;
  site_id?: string | null;
  zone_id?: string | null;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
}

const SENSOR_METRICS = [
  { type: "gas", name: "Hazardous Gas Detector (gas)", unit: "ppm", defaultThreshold: 50 },
  { type: "temperature", name: "Ambient Temperature (temperature)", unit: "°C", defaultThreshold: 42 },
  { type: "vibration", name: "Structural Vibration (vibration)", unit: "mm/s", defaultThreshold: 20 },
  { type: "noise", name: "Perimeter Acoustic Noise (noise)", unit: "dB", defaultThreshold: 85 },
  { type: "dust", name: "Particulate Matter / Dust (dust)", unit: "µg/m³", defaultThreshold: 100 },
  { type: "humidity", name: "Relative Humidity (humidity)", unit: "%", defaultThreshold: 75 },
  { type: "tilt", name: "Structural Tilt (tilt)", unit: "deg", defaultThreshold: 5 },
];

export default function RulesPage() {
  const queryClient = useQueryClient();
  const activeSiteId = useProjectStore((s) => s.activeSiteId);
  const user = useAuthStore((s) => s.user);

  const canManageRules = hasRole(user?.role, ["admin", "project_manager", "safety_officer"]);
  const canDeleteRules = hasRole(user?.role, ["admin", "project_manager"]);

  // Rule Builder Form state
  const [ruleName, setRuleName] = useState("Excavation Gas Hazard Ceiling");
  const [selectedMetric, setSelectedMetric] = useState(SENSOR_METRICS[0]);
  const [operator, setOperator] = useState(">");
  const [threshold, setThreshold] = useState<number>(50);
  const [duration, setDuration] = useState<number>(0);
  const [severity, setSeverity] = useState<"critical" | "warning" | "info">("warning");
  const [actionType, setActionType] = useState("create_alert_and_notify");
  const [isSaving, setIsSaving] = useState(false);

  // Dry-run simulator state
  const [dryRunValue, setDryRunValue] = useState<number>(65);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<{ triggered: boolean; message: string } | null>(null);

  // Fetch existing rules (scoped to site if activeSiteId is present, or all)
  const {
    data: rulesData,
    refetch,
    isLoading,
  } = useQuery<any>({
    queryKey: ["rules", activeSiteId],
    queryFn: () =>
      apiClient.get<any>("/api/v1/rules", {
        params: activeSiteId ? { site_id: activeSiteId } : undefined,
      }),
  });

  const fetchedRules = normalizeList<RuleItem>(rulesData);
  const rules = Array.isArray(fetchedRules) ? fetchedRules : [];

  const handleToggleRule = async (id: string, currentEnabled: boolean) => {
    if (!canManageRules) {
      toast.error("You need Admin, Project Manager, or Safety Officer permissions to toggle rules.");
      return;
    }
    try {
      await apiClient.post(`/api/v1/rules/${id}/toggle`);
      await queryClient.invalidateQueries({ queryKey: ["rules"] });
      refetch();
      toast.success(`Rule ${!currentEnabled ? "activated" : "deactivated"} in stream processor`);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Failed to toggle rule";
      toast.error(`Toggle failed: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
    }
  };

  const handleDeleteRule = async (id: string, name: string) => {
    if (!canDeleteRules) {
      toast.error("You need Admin or Project Manager permissions to delete rules.");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete rule "${name}"?`)) return;
    try {
      await apiClient.delete(`/api/v1/rules/${id}`);
      await queryClient.invalidateQueries({ queryKey: ["rules"] });
      refetch();
      toast.success(`Rule "${name}" deleted successfully.`);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Failed to delete rule";
      toast.error(`Delete failed: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
    }
  };

  const handleDryRunTest = async () => {
    setIsEvaluating(true);
    try {
      const res = await apiClient.post<any>("/api/v1/rules/test", {
        operator,
        threshold_val1: Number(threshold),
        duration_seconds: Math.max(0, Math.round(Number(duration) * 60)),
        test_value: Number(dryRunValue),
      });

      const isBreach = Boolean(res.matched);
      setDryRunResult({
        triggered: isBreach,
        message: isBreach
          ? `RULE TRIGGERED: Value ${dryRunValue} ${selectedMetric.unit} breaches condition (${operator} ${threshold} ${selectedMetric.unit}${
              duration > 0 ? `, sustained for ${duration} min` : ""
            }) -> Raising ${severity.toUpperCase()} alert.`
          : `RULE PASSED: Value ${dryRunValue} ${selectedMetric.unit} is within normal bounds (${operator} ${threshold} ${selectedMetric.unit} condition not met).`,
      });
    } catch {
      // Fallback evaluation if server test endpoint is unreachable
      let triggered = false;
      const val = Number(dryRunValue);
      const thresh = Number(threshold);
      if (operator === ">") triggered = val > thresh;
      else if (operator === ">=") triggered = val >= thresh;
      else if (operator === "<") triggered = val < thresh;
      else if (operator === "<=") triggered = val <= thresh;
      else if (operator === "==") triggered = val === thresh;
      else if (operator === "!=") triggered = val !== thresh;

      setDryRunResult({
        triggered,
        message: triggered
          ? `RULE TRIGGERED: Value ${dryRunValue} ${selectedMetric.unit} breaches threshold ${threshold} ${selectedMetric.unit} -> Raising ${severity.toUpperCase()} alert.`
          : `RULE PASSED: Value ${dryRunValue} ${selectedMetric.unit} is within normal operational bounds.`,
      });
    } finally {
      setIsEvaluating(false);
    }
  };

  // Plain English sentence preview
  const plainEnglishSentence = `IF ${selectedMetric.name} is ${operator} ${threshold} ${selectedMetric.unit}${
    duration > 0 ? ` continuously for ${duration} minute(s)` : " immediately"
  }, THEN trigger a ${severity.toUpperCase()} alert and execute action "${actionType.replace(/_/g, " ")}".`;

  const handleSaveRule = async () => {
    if (!ruleName.trim()) {
      toast.error("Please enter a rule designation name.");
      return;
    }
    if (!canManageRules) {
      toast.error("You need Admin, Project Manager, or Safety Officer permissions to create rules.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: ruleName.trim(),
        sensor_type: selectedMetric.type,
        operator: operator,
        threshold_val1: Number(threshold),
        duration_seconds: Math.max(0, Math.round(Number(duration) * 60)),
        severity: severity,
        site_id: activeSiteId || null,
        is_enabled: true,
        cooldown_seconds: 300,
        auto_create_incident: actionType === "create_incident_ticket" || severity === "critical",
        description: plainEnglishSentence,
      };

      await apiClient.post("/api/v1/rules", payload);
      toast.success(`Rule "${ruleName}" successfully deployed live to stream worker!`);
      await queryClient.invalidateQueries({ queryKey: ["rules"] });
      refetch();
      setRuleName("");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || "Failed to create rule";
      toast.error(`Failed to deploy rule: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automated Telemetry Rules Engine"
        description="Declarative edge stream processing rules evaluating IoT sensor thresholds and triggering instant hazard notifications."
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Rule Builder */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-medium capitalize text-zinc-500">
                Rule Definition & Condition Logic
              </CardTitle>
              <CardDescription className="text-xs">
                Configure threshold predicates evaluated in event-time against live IoT sensor telemetry.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-4 text-xs">
              {/* Rule Name */}
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Rule Designation</label>
                <Input
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g. Excavation Gas Spike Warning"
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              {/* Metric Type */}
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Target Telemetry Metric</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SENSOR_METRICS.map((m) => (
                    <Button
                      key={m.type}
                      type="button"
                      variant={selectedMetric.type === m.type ? "amber" : "outline"}
                      size="sm"
                      onClick={() => {
                        setSelectedMetric(m);
                        setThreshold(m.defaultThreshold);
                      }}
                      className="h-8 text-xs font-semibold justify-start truncate"
                    >
                      {m.name.split(" ")[0]}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Predicate Operator & Threshold */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300">Operator</label>
                  <select
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                    className="w-full h-9 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100"
                  >
                    <option value=">">&gt; (Greater than)</option>
                    <option value=">=">&gt;= (Greater or equal)</option>
                    <option value="<">&lt; (Less than)</option>
                    <option value="<=">&lt;= (Less or equal)</option>
                    <option value="==">== (Equal to)</option>
                    <option value="!=">!= (Not equal)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                    Threshold ({selectedMetric.unit})
                  </label>
                  <Input
                    type="number"
                    value={threshold}
                    onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)}
                    className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 font-mono text-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300">Window (Minutes)</label>
                  <Input
                    type="number"
                    min={0}
                    value={duration}
                    onChange={(e) => setDuration(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="0 = instant"
                    className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 font-mono text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              {/* Severity & Action */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300">Alert Severity</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(["critical", "warning", "info"] as const).map((s) => (
                      <Button
                        key={s}
                        type="button"
                        variant={severity === s ? "amber" : "outline"}
                        size="sm"
                        onClick={() => setSeverity(s)}
                        className="h-8 text-xs capitalize"
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300">Automated Remediation</label>
                  <select
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value)}
                    className="w-full h-8 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2 text-xs text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="create_alert_and_notify">Alert + SMS/Email Notification</option>
                    <option value="create_incident_ticket">Auto-Spawn Safety Incident Ticket</option>
                    <option value="create_alert_only">Log Alert in Feed Only</option>
                  </select>
                </div>
              </div>

              {/* Plain English Sentence Preview */}
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-1">
                <span className="text-xs capitalize font-medium text-amber-600 dark:text-amber-500 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Plain-English Predicate Preview
                </span>
                <p className="text-xs text-zinc-800 dark:text-zinc-200 font-medium leading-relaxed">
                  &ldquo;{plainEnglishSentence}&rdquo;
                </p>
              </div>

              <Button
                variant="amber"
                size="sm"
                disabled={isSaving || !canManageRules}
                onClick={handleSaveRule}
                className="w-full h-9 font-bold flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deploying to Stream Worker...
                  </>
                ) : (
                  "Deploy Automation Rule"
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Dry Run Simulator */}
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-medium capitalize text-zinc-500 flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Rule Dry-Run Test Simulation
              </CardTitle>
              <CardDescription className="text-xs">
                Validate rule behavior against mock inputs using the backend operator engine before committing to live stream.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                    Simulated Sensor Value ({selectedMetric.unit})
                  </label>
                  <Input
                    type="number"
                    value={dryRunValue}
                    onChange={(e) => setDryRunValue(parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 font-mono text-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isEvaluating}
                  onClick={handleDryRunTest}
                  className="mt-5 h-8 text-xs font-semibold border-zinc-300 dark:border-zinc-700"
                >
                  {isEvaluating ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin text-zinc-500" />
                  ) : (
                    <Play className="h-3.5 w-3.5 mr-1 text-emerald-500 dark:text-emerald-400" />
                  )}
                  Evaluate
                </Button>
              </div>

              {dryRunResult && (
                <div
                  className={`p-3 rounded-lg border text-xs font-mono ${
                    dryRunResult.triggered
                      ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-300"
                      : "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-300"
                  }`}
                >
                  {dryRunResult.message}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Active Rules Directory */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-medium capitalize text-zinc-500">
                Active Stream Rules ({Array.isArray(rules) ? rules.length : 0})
              </CardTitle>
              <CardDescription className="text-xs">
                Evaluated in real-time by the Redis Streams stream worker on every incoming telemetry message.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-3">
              {isLoading ? (
                <div className="py-8 text-center text-xs text-zinc-500 flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                  Loading active stream rules...
                </div>
              ) : !Array.isArray(rules) || rules.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  No stream processing rules configured yet. Create one using the builder on the left.
                </div>
              ) : (
                rules.map((rule) => {
                  const isEnabled = rule.is_enabled ?? (rule as any).is_active ?? true;
                  const thresholdVal = rule.threshold_val1 ?? (rule as any).threshold ?? 0;
                  const durSec = rule.duration_seconds ?? ((rule as any).duration_minutes ? (rule as any).duration_minutes * 60 : 0);
                  const durMin = Math.round(durSec / 60);
                  const metricObj = SENSOR_METRICS.find((m) => m.type === rule.sensor_type);
                  const unit = metricObj?.unit || (rule as any).unit || "";

                  return (
                    <div
                      key={rule.id}
                      className={`p-3.5 rounded-xl border transition-all space-y-2 text-xs ${
                        isEnabled
                          ? "border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-850/40"
                          : "border-zinc-200/50 dark:border-zinc-800/40 bg-zinc-100/40 dark:bg-zinc-900/40 opacity-60"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <SeverityBadge severity={rule.severity} showDot={false} />
                          <span className="font-bold text-zinc-900 dark:text-zinc-100">{rule.name}</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <Switch
                            checked={isEnabled}
                            disabled={!canManageRules}
                            onCheckedChange={() => handleToggleRule(rule.id, isEnabled)}
                          />
                          {canDeleteRules && (
                            <button
                              type="button"
                              onClick={() => handleDeleteRule(rule.id, rule.name)}
                              title="Delete rule"
                              className="p-1 text-zinc-400 hover:text-red-500 rounded transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {rule.description && (
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">{rule.description}</p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800/80 text-[10px] font-mono text-zinc-500">
                        <span>
                          Condition: <b className="text-zinc-800 dark:text-zinc-200">{rule.sensor_type}</b> {rule.operator} {thresholdVal} {unit}
                        </span>
                        <div className="flex items-center gap-2">
                          {rule.auto_create_incident && (
                            <span className="text-red-500 font-semibold flex items-center gap-0.5">
                              <ShieldAlert className="h-3 w-3" /> Auto-Incident
                            </span>
                          )}
                          <span>Hold: {durSec > 0 ? (durMin > 0 ? `${durMin}m` : `${durSec}s`) : "0s"}</span>
                          {rule.cooldown_seconds ? <span>CD: {rule.cooldown_seconds}s</span> : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
