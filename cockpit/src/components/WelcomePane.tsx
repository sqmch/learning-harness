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
            <span className="welcome-btn-ref">launch claude</span> button types it for you.
          </li>
          <li>
            Say <b>“new course”</b>. The tutor interviews you — topic, goals, background,
            hours per week — then drafts your course arc and asks you to review it before
            building anything.
          </li>
          <li>
            <b>That's it.</b> This page turns into your course the moment module 00 exists,
            and every session after starts the same way: open the cockpit, say
            “start session”.
          </li>
        </ol>

        <p className="welcome-foot">
          Your course grows inside this repo — plain markdown and JSON, yours to read and
          version. Already have a course elsewhere? Serve it instead:{" "}
          <code>HARNESS_REPO=&lt;path&gt;</code> or <code>--repo &lt;path&gt;</code>.
        </p>
      </div>
    </section>
  );
}
