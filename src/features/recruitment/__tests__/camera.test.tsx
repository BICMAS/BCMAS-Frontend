import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getMockUser } from "@/config/mock-users";
import { resetLibrary } from "@/features/assessment-library/services/central-library";
import { getAssessmentVersion, resetOrgLibrary } from "@/features/assessment-library/services/org-library";

import { CameraLogPanel } from "../components/camera-log";
import { CandidateAssessmentView } from "../components/candidate-assessment-view";
import { CandidateInterviewView } from "../components/candidate-interview-view";
import { VacancyEditor } from "../components/vacancy-editor";
import {
  agreeToCamera,
  allowWithoutCamera,
  cameraSummary,
  newCameraLog,
  recordCamera,
  requestCameraAlternative,
} from "../services/camera";
import { attemptFor, getCandidateAssessment, inviteToAssessment, saveAnswer, scoreWrittenAnswer, startAssessment, submitAssessment } from "../services/delivery";
import { giveConsent, interviewFor, inviteToInterview, startInterview } from "../services/interview";
import { emptyDetails, listOutbox, recruitmentStore, resetRecruitment } from "../services/vacancies";
import type { CameraPolicy } from "../types";

// Candidate camera: on/off presence only, for the assessment and the AI-avatar interview.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/talent/candidates",
  useSearchParams: () => new URLSearchParams(),
}));

const GEC = "org-gec";
const HRBP = getMockUser("user-priya").name;
const APP = "app-se-1";

class FakeTrack extends EventTarget {
  muted = false;
  stopped = false;
  stop() {
    this.stopped = true;
  }
}
let track: FakeTrack;
let getUserMedia: ReturnType<typeof vi.fn>;

function policy(value: CameraPolicy) {
  recruitmentStore.data().vacancies.find((v) => v.id === "vac-sales-exec")!.camera = value;
}

function pass(token: string) {
  for (const item of getAssessmentVersion(GEC, "oa-sales-custom", "1.0")!.items) {
    if (item.responseType === "case_response") saveAnswer(token, item.id, { text: "Prioritise outlets by value." });
    else saveAnswer(token, item.id, { optionId: item.scoring.correctOptionId! });
  }
  submitAssessment(token);
  scoreWrittenAnswer(GEC, APP, "q05", 4, "", HRBP);
}

function inviteInterview() {
  policy("off");
  const token = inviteToAssessment(GEC, APP, HRBP);
  startAssessment(token);
  pass(token);
  policy("required");
  return inviteToInterview(GEC, APP, HRBP);
}

const types = () => attemptFor(GEC, APP)!.camera.events.map((e) => e.type);

beforeEach(() => {
  resetLibrary();
  resetOrgLibrary();
  resetRecruitment();
  track = new FakeTrack();
  getUserMedia = vi.fn(async () => ({ getTracks: () => [track], getVideoTracks: () => [track] }));
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
});
afterEach(() => {
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("Camera rules", () => {
  it("required: cannot start either stage until the camera is on", () => {
    policy("required");
    const token = inviteToAssessment(GEC, APP, HRBP);
    expect(() => startAssessment(token)).toThrow("Turn on your camera");
    expect(() => recordCamera("assessment", token, true)).toThrow("Agree");
    agreeToCamera("assessment", token);
    recordCamera("assessment", token, true);
    startAssessment(token);
    pass(token);
    const interview = inviteToInterview(GEC, APP, HRBP);
    giveConsent(interview, "text", "");
    expect(() => startInterview(interview)).toThrow("Turn on your camera");
    agreeToCamera("interview", interview);
    recordCamera("interview", interview, true);
    startInterview(interview);
    expect(interviewFor(GEC, APP)!.status).toBe("in_progress");
  });

  it("optional and off: starting never needs the camera", () => {
    for (const p of ["optional", "off"] as const) {
      resetRecruitment();
      policy(p);
      startAssessment(inviteToAssessment(GEC, APP, HRBP));
      expect(attemptFor(GEC, APP)!.status).toBe("in_progress");
    }
  });

  it("HR can allow one candidate without a camera, with a reason", () => {
    policy("required");
    const token = inviteToAssessment(GEC, APP, HRBP);
    requestCameraAlternative("assessment", token, "No camera at home");
    expect(() => allowWithoutCamera(GEC, "assessment", APP, " ", HRBP)).toThrow("reason");
    expect(() => allowWithoutCamera("org-ths", "assessment", APP, "x", HRBP)).toThrow();
    allowWithoutCamera(GEC, "assessment", APP, "No device", HRBP);
    startAssessment(token);
    expect(types()).toEqual(["alternative_requested", "waived"]);
  });

  it("never changes the score, and stops logging after submission", () => {
    const score = (toggle: boolean) => {
      resetRecruitment();
      const token = inviteToAssessment(GEC, APP, HRBP);
      startAssessment(token);
      if (toggle) {
        agreeToCamera("assessment", token);
        for (const on of [true, false, true, false]) recordCamera("assessment", token, on);
      }
      pass(token);
      recordCamera("assessment", token, true);
      return attemptFor(GEC, APP)!;
    };
    const plain = score(false);
    const toggled = score(true);
    expect(toggled.score!.percent).toBe(plain.score!.percent);
    expect(toggled.score!.outcome).toBe(plain.score!.outcome);
    expect(toggled.camera.events.filter((e) => e.type === "on")).toHaveLength(2);
  });

  it("keeps the policy from the invitation and hides the log from the candidate", () => {
    policy("required");
    const token = inviteToAssessment(GEC, APP, HRBP);
    policy("off");
    expect(getCandidateAssessment(token)!.camera).toEqual({ policy: "required", waived: false, agreed: false });
    expect(listOutbox(GEC).at(-1)!.body).toContain("camera must be on");
  });

  it("counts time off between start and end only", () => {
    const at = (s: number) => new Date(Date.UTC(2026, 10, 24, 9, 0, s)).toISOString();
    const log = newCameraLog("required");
    log.events = [
      { type: "on", at: at(0) },
      { type: "off", at: at(5) },
      { type: "on", at: at(8) },
      { type: "off", at: at(20) },
      { type: "on", at: at(35) },
    ];
    expect(cameraSummary(log, at(10), at(60))).toEqual({ everOn: true, timesOff: 1, offSeconds: 15 });
    expect(cameraSummary(log, at(10), at(30))!.offSeconds).toBe(10);
    expect(cameraSummary(log, null, null)).toBeNull();
  });
});

describe("Candidate pages", () => {
  async function turnOn() {
    await userEvent.click(screen.getByRole("checkbox", { name: "I agree to use my camera" }));
    await userEvent.click(screen.getByRole("button", { name: "Turn on camera" }));
    await screen.findByText(/^Your camera is on\.$/);
  }

  it("assessment: turns on, pauses when the camera drops, resumes, and releases at the end", async () => {
    policy("required");
    const token = inviteToAssessment(GEC, APP, HRBP);
    render(<CandidateAssessmentView token={token} />);
    const start = screen.getByRole("button", { name: "Start Assessment" }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    await turnOn();
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
    await userEvent.click(start);
    expect(screen.getByRole("region", { name: "Question 1" })).toBeTruthy();

    act(() => void track.dispatchEvent(new Event("ended")));
    expect(screen.getByText("Turn your camera back on to continue")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Question 1" })).toBeNull();
    expect(types().at(-1)).toBe("off");

    track = new FakeTrack();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "Question 1" })).toBeTruthy();

    act(() => submitAssessment(token));
    await waitFor(() => expect(track.stopped).toBe(true));
  });

  it("explains a blocked camera and offers another arrangement", async () => {
    getUserMedia.mockRejectedValue(new DOMException("no", "NotAllowedError"));
    policy("required");
    const token = inviteToAssessment(GEC, APP, HRBP);
    render(<CandidateAssessmentView token={token} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "I agree to use my camera" }));
    await userEvent.click(screen.getByRole("button", { name: "Turn on camera" }));
    expect(await screen.findByText(/browser is blocking the camera/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "I can't use a camera" }));
    await userEvent.type(screen.getByRole("textbox"), "My laptop has none");
    await userEvent.click(screen.getByRole("button", { name: "Ask for another arrangement" }));
    expect(types()).toContain("alternative_requested");
    act(() => allowWithoutCamera(GEC, "assessment", APP, "No device", HRBP));
    expect((screen.getByRole("button", { name: "Start Assessment" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("optional: can start without, and turn the camera off", async () => {
    const token = inviteToAssessment(GEC, APP, HRBP);
    render(<CandidateAssessmentView token={token} />);
    expect((screen.getByRole("button", { name: "Start Assessment" }) as HTMLButtonElement).disabled).toBe(false);
    await turnOn();
    await userEvent.click(screen.getByRole("button", { name: "Turn off camera" }));
    expect(track.stopped).toBe(true);
    expect(types()).toEqual(["agreed", "on", "off"]);
  });

  it("logs the camera going off when the page is left", async () => {
    const token = inviteToAssessment(GEC, APP, HRBP);
    const { unmount } = render(<CandidateAssessmentView token={token} />);
    await turnOn();
    unmount();
    expect(track.stopped).toBe(true);
    expect(types().at(-1)).toBe("off");
  });

  it("interview: needs the camera, and hides questions while it is off", async () => {
    const token = inviteInterview();
    render(<CandidateInterviewView token={token} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /I agree to take part/ }));
    await userEvent.click(screen.getByRole("button", { name: "Continue to equipment check" }));
    const start = screen.getByRole("button", { name: "Start Interview" }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    await turnOn();
    await userEvent.click(start);
    await userEvent.type(screen.getByLabelText("Your answer"), "Half an answer");
    act(() => void track.dispatchEvent(new Event("mute")));
    expect(screen.queryByRole("region", { name: "Question 1" })).toBeNull();
    act(() => void track.dispatchEvent(new Event("unmute")));
    expect((screen.getByLabelText("Your answer") as HTMLTextAreaElement).value).toBe("Half an answer");
  });

  it("shows nothing about the camera when it is off for the vacancy", () => {
    policy("off");
    render(<CandidateAssessmentView token={inviteToAssessment(GEC, APP, HRBP)} />);
    expect(screen.queryByRole("region", { name: "Camera" })).toBeNull();
  });
});

describe("HR screens", () => {
  it("shows the log and lets HR allow a candidate without a camera", async () => {
    policy("required");
    const token = inviteToAssessment(GEC, APP, HRBP);
    requestCameraAlternative("assessment", token, "No camera");
    render(<CameraLogPanel organisationId={GEC} applicationId={APP} stage="assessment" actor={HRBP} record={attemptFor(GEC, APP)!} />);
    const panel = screen.getByRole("region", { name: "Camera log" });
    expect(within(panel).getByText(/asked for another arrangement\. Contact them/)).toBeTruthy();
    await userEvent.type(within(panel).getByLabelText("Reason for allowing without camera"), "No device");
    await userEvent.click(within(panel).getByRole("button", { name: "Allow without camera" }));
    expect(attemptFor(GEC, APP)!.camera.waived).toMatchObject({ by: HRBP, reason: "No device" });
  });

  it("lets HR choose the policy on the vacancy", async () => {
    const onChange = vi.fn();
    render(
      <VacancyEditor organisationId={GEC} value={emptyDetails()} onChange={onChange} readOnly={false} tab="assessment" onTabChange={() => {}} />,
    );
    const select = screen.getByLabelText(/Candidate camera/) as HTMLSelectElement;
    expect(select.value).toBe("off");
    await userEvent.selectOptions(select, "required");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ camera: "required" }));
  });
});
