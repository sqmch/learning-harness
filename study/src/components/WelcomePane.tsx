/**
 * First-contact pane: shown in place of the rail + doc pane when the served
 * repo holds no course yet. The terminal stays mounted to the right — the
 * whole point is that onboarding happens *here*, not in some other window.
 */
export function WelcomePane(props: { repoRoot: string }) {
  return (
    <section className="welcome">
      <div className="welcome-inner">
        <div className="welcome-mark">◇</div>
        <h1>No course lives here yet.</h1>
        <p className="welcome-sub">
          Serving <code>{props.repoRoot}</code> — a blank harness, waiting for its course.
        </p>

        <ol className="welcome-steps">
          <li>
            <b>Launch your tutor</b> in the terminal on the right — the{" "}
            <span className="welcome-btn-ref">launch</span> button types the command for you
            (claude by default; pick codex or another agent via{" "}
            <span className="welcome-btn-ref">⚙</span>).
          </li>
          <li>
            Say <b>“new course”</b>. The tutor interviews you — topic, goals, background,
            hours per week — then drafts your course arc and asks you to review it before
            building anything.
          </li>
          <li>
            <b>That's it.</b> This page turns into your course the moment module 00 exists,
            and every session after starts the same way: open the study, say
            “start session”.
          </li>
        </ol>

        <div className="welcome-how">
          <div className="welcome-how-title">What you're signing up for</div>
          <ul>
            <li>
              Modules are generated <b>one at a time, as you reach them</b>, each calibrated
              to how the previous one actually went. Every module = a written lesson, a build
              task, a runnable scaffold with the load-bearing parts left as gaps, and
              automated checks you run yourself. Red → green is the unit of progress.
            </li>
            <li>
              <b>The tutor never writes your solution code.</b> When you're stuck, hints
              unseal one level at a time: a nudge, then the approach, then near-spoiler
              pseudocode — never the answer.
            </li>
            <li>
              Every session opens with a short <b>recall quiz</b> (spaced repetition, honest
              grading), and closes with the tutor updating your progress files and{" "}
              <b>committing to git</b> — any session, any model, picks up exactly where you
              left off.
            </li>
          </ul>
        </div>

        <p className="welcome-foot">
          Your course grows inside this repo — plain markdown and JSON, yours to read and
          version. Already have a course elsewhere? Serve it instead:{" "}
          <code>HARNESS_REPO=&lt;path&gt;</code> or <code>--repo &lt;path&gt;</code>.
        </p>
      </div>
    </section>
  );
}
