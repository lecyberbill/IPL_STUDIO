import { describe, expect, it } from 'vitest';
import { analyzeIPLSemantics } from './iplSemantics.ts';

const CANONICAL_WEATHER = `// IPL Spec v1.0 - Full Real-Time Weather Forecast Dashboard App
add view WeatherDashboard {
  title: "Live Weather Forecast Dashboard",
  theme: "dark",
  components: ["locationSearchInput", "unitToggleSwitch"]
}
add entity WeatherRequest {
  id: id,
  locationName: text,
  requestedAt: date,
  units: options("metric", "imperial")
}
add entity WeatherReport {
  city: text,
  temperature: number,
  isAlertActive: boolean
}
listen event on "weather:search" {
  try {
    read searchParams from locationSearchInput { where: locationName != "" }
    read currentReport from weatherService { query: searchParams.locationName }
    compute weatherIndex from currentReport { comfortScore: currentReport.temperature - (currentReport.humidity * 0.1) }
    if (currentReport.temperature > 35) {
      set currentReport.isAlertActive = true
      send alert to extremeAlertBanner { title: "Extreme Weather Warning", severity: "HIGH" }
    } else {
      set currentReport.isAlertActive = false
    }
    send update to weatherSummaryCard { data: currentReport, index: weatherIndex }
    return { report: currentReport, index: weatherIndex, status: "SUCCESS" }
  } catch (err) {
    send log to systemMonitor { level: "ERROR", message: err.message }
    return { status: "FAILED", reason: "Location weather data unavailable" }
  }
}`;

describe('analyzeIPLSemantics', () => {
  it('produces no diagnostics on the canonical example (no false positives)', () => {
    expect(analyzeIPLSemantics(CANONICAL_WEATHER)).toEqual([]);
  });

  it('flags duplicate top-level declarations as a warning', () => {
    const out = analyzeIPLSemantics('add entity User { name: text }\nadd entity User { name: text }');
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('warning');
    expect(out[0].message).toContain('Duplicate declaration of "User"');
  });

  it('flags unknown intent types as info', () => {
    const out = analyzeIPLSemantics('add entity User {\n  name: text,\n  age: integer\n}');
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('info');
    expect(out[0].message).toContain('Unknown intent type "integer"');
  });

  it('does not flag views or value-style fields', () => {
    const out = analyzeIPLSemantics('add view Dashboard {\n  title: "Hello",\n  theme: "dark",\n  components: ["a", "b"]\n}');
    expect(out).toEqual([]);
  });

  it('flags set on a base never declared or produced', () => {
    const out = analyzeIPLSemantics('set ghost.state = "spooky"');
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('info');
    expect(out[0].message).toContain('"ghost"');
  });

  it('accepts set on a target produced by a read', () => {
    const out = analyzeIPLSemantics('read currentReport from svc\nset currentReport.isAlertActive = true');
    expect(out).toEqual([]);
  });

  it('flags unprotected I/O inside a listen', () => {
    const out = analyzeIPLSemantics('listen event on "go" {\n  read x from y\n  send ok to card\n}');
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.every(d => d.severity === 'info')).toBe(true);
    expect(out.every(d => d.message.includes('not wrapped in try/catch'))).toBe(true);
  });

  it('accepts I/O wrapped in try/catch, including the catch body', () => {
    const out = analyzeIPLSemantics(
      'listen event on "go" {\n  try {\n    read x from y\n  } catch (err) {\n    send log to mon\n  }\n}'
    );
    expect(out).toEqual([]);
  });

  it('ignores top-level I/O outside any listen', () => {
    const out = analyzeIPLSemantics('read x from y\nsend a to b');
    expect(out).toEqual([]);
  });

  it('detects duplicates on add view declarations too', () => {
    const out = analyzeIPLSemantics('add view Home { title: "A" }\nadd view Home { title: "B" }');
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('warning');
  });
});
