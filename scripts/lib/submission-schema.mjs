/**
 * submission.json's shape (docs/design/m5-design.md §4) -- one payload feeding five
 * renderers. Cross-checks against `recon`/`state` degrade to a warning when either is
 * absent, mirroring requirements-schema.mjs's crossCheckRecon.
 */
import { DELIVERABLE_STATUSES } from './schema.mjs';

export const SUBMISSION_SCHEMA_VERSION = 1;

const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';
const isString = (v) => typeof v === 'string';

export function validateSubmission(doc, options = {}) {
  const { recon, state } = options ?? {};
  const errors = [];
  const warnings = [];

  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { valid: false, errors: ['submission must be an object'], warnings };
  }
  if (doc.schema_version !== SUBMISSION_SCHEMA_VERSION) {
    errors.push(`schema_version ${doc.schema_version} != supported ${SUBMISSION_SCHEMA_VERSION}`);
  }

  validateReadme(doc.readme, errors);
  validateRunbook(doc.runbook, errors);
  validateDevpostForm(doc.devpost_form, errors, warnings, recon, state);
  validateVideoScript(doc.video_script, errors);
  validateScreenshots(doc.screenshots, errors);

  return { valid: errors.length === 0, errors, warnings };
}

function validateReadme(readme, errors) {
  if (readme === null || typeof readme !== 'object' || Array.isArray(readme)) {
    errors.push('readme must be an object');
    return;
  }
  for (const key of ['tagline', 'thesis_quote', 'problem', 'security_summary']) {
    if (!isNonEmptyString(readme[key])) errors.push(`readme.${key} must be a non-empty string`);
  }
  const features = Array.isArray(readme.features) ? readme.features : null;
  if (features === null || features.length === 0) {
    errors.push('readme.features must be a non-empty array');
  } else {
    features.forEach((f, i) => {
      if (!isNonEmptyString(f?.title)) errors.push(`readme.features[${i}].title must be a non-empty string`);
      if (!isNonEmptyString(f?.description)) errors.push(`readme.features[${i}].description must be a non-empty string`);
    });
  }
  if (readme.demo_data_note !== undefined && readme.demo_data_note !== null && !isString(readme.demo_data_note)) {
    errors.push('readme.demo_data_note must be a string or null');
  }
  if (readme.hackathon_disclosure !== undefined && readme.hackathon_disclosure !== null) {
    const hd = readme.hackathon_disclosure;
    const claims = Array.isArray(hd?.required_stack) ? hd.required_stack : null;
    if (claims === null) {
      errors.push('readme.hackathon_disclosure.required_stack must be an array when hackathon_disclosure is present');
    } else {
      claims.forEach((c, i) => {
        if (!isNonEmptyString(c?.claim)) errors.push(`readme.hackathon_disclosure.required_stack[${i}].claim must be a non-empty string`);
        if (!isNonEmptyString(c?.evidence)) errors.push(`readme.hackathon_disclosure.required_stack[${i}].evidence must be a non-empty string`);
      });
    }
  }
}

function validateRunbook(runbook, errors) {
  if (runbook === null || typeof runbook !== 'object' || Array.isArray(runbook)) {
    errors.push('runbook must be an object');
    return;
  }
  if (!Array.isArray(runbook.prerequisites) || !runbook.prerequisites.every(isNonEmptyString)) {
    errors.push('runbook.prerequisites must be an array of non-empty strings');
  }
  if (!Array.isArray(runbook.quick_start_steps) || runbook.quick_start_steps.length === 0
    || !runbook.quick_start_steps.every(isNonEmptyString)) {
    errors.push('runbook.quick_start_steps must be a non-empty array of non-empty strings');
  }
  const walkthrough = Array.isArray(runbook.manual_walkthrough) ? runbook.manual_walkthrough : null;
  if (walkthrough === null || walkthrough.length === 0) {
    errors.push('runbook.manual_walkthrough must be a non-empty array');
  } else {
    walkthrough.forEach((s, i) => {
      if (!(typeof s?.step === 'number' && s.step >= 1)) errors.push(`runbook.manual_walkthrough[${i}].step must be a positive number`);
      if (!isNonEmptyString(s?.instructions)) errors.push(`runbook.manual_walkthrough[${i}].instructions must be a non-empty string`);
      if (!isNonEmptyString(s?.expected)) errors.push(`runbook.manual_walkthrough[${i}].expected must be a non-empty string`);
    });
  }
  const troubleshooting = Array.isArray(runbook.troubleshooting) ? runbook.troubleshooting : null;
  if (troubleshooting === null) {
    errors.push('runbook.troubleshooting must be an array');
  } else {
    troubleshooting.forEach((t, i) => {
      if (!isNonEmptyString(t?.symptom)) errors.push(`runbook.troubleshooting[${i}].symptom must be a non-empty string`);
      if (!isNonEmptyString(t?.fix)) errors.push(`runbook.troubleshooting[${i}].fix must be a non-empty string`);
    });
  }
  if (!isNonEmptyString(runbook.reset_procedure)) errors.push('runbook.reset_procedure must be a non-empty string');
  if (!(typeof runbook.expected_duration_minutes === 'number' && runbook.expected_duration_minutes > 0)) {
    errors.push('runbook.expected_duration_minutes must be a positive number');
  }
}

function validateDevpostForm(form, errors, warnings, recon, state) {
  if (form === null || typeof form !== 'object' || Array.isArray(form)) {
    errors.push('devpost_form must be an object');
    return;
  }
  const fields = Array.isArray(form.fields) ? form.fields : null;
  if (fields === null) {
    errors.push('devpost_form.fields must be an array');
  } else {
    fields.forEach((f, i) => {
      if (!isNonEmptyString(f?.id)) errors.push(`devpost_form.fields[${i}].id must be a non-empty string`);
      if (!isNonEmptyString(f?.text)) errors.push(`devpost_form.fields[${i}].text must be a non-empty string`);
    });
    crossCheckFormFields(fields, errors, warnings, recon);
  }
  if (!isNonEmptyString(form.challenges)) errors.push('devpost_form.challenges must be a non-empty string');

  const tracker = Array.isArray(form.requirements_tracker) ? form.requirements_tracker : null;
  if (tracker === null) {
    errors.push('devpost_form.requirements_tracker must be an array');
  } else {
    tracker.forEach((r, i) => {
      if (!isNonEmptyString(r?.id)) errors.push(`devpost_form.requirements_tracker[${i}].id must be a non-empty string`);
      if (!isNonEmptyString(r?.requirement)) errors.push(`devpost_form.requirements_tracker[${i}].requirement must be a non-empty string`);
      if (!DELIVERABLE_STATUSES.includes(r?.status)) {
        errors.push(`devpost_form.requirements_tracker[${i}].status must be one of ${DELIVERABLE_STATUSES.join(', ')}, got "${r?.status}"`);
      }
    });
    crossCheckRequirementsTracker(tracker, errors, warnings, state);
  }

  const bonus = Array.isArray(form.bonus_tracker) ? form.bonus_tracker : null;
  if (bonus === null) {
    errors.push('devpost_form.bonus_tracker must be an array');
  } else {
    bonus.forEach((b, i) => {
      if (!isNonEmptyString(b?.id)) errors.push(`devpost_form.bonus_tracker[${i}].id must be a non-empty string`);
      if (!DELIVERABLE_STATUSES.includes(b?.status)) {
        errors.push(`devpost_form.bonus_tracker[${i}].status must be one of ${DELIVERABLE_STATUSES.join(', ')}, got "${b?.status}"`);
      }
      if (b?.status === 'done' && (b?.url === null || b?.url === undefined || !isNonEmptyString(b.url))) {
        errors.push(`devpost_form.bonus_tracker[${i}] has status "done" but no non-null url`);
      }
    });
  }
}

function crossCheckFormFields(fields, errors, warnings, recon) {
  const reconFields = Array.isArray(recon?.submission_form?.fields) ? recon.submission_form.fields : null;
  if (reconFields === null) {
    warnings.push(recon ? 'recon supplied but submission_form.fields is missing -- field limits were not checked'
      : 'no recon supplied -- devpost_form field ids/limits were not checked');
    return;
  }
  const byId = new Map(reconFields.map((f) => [f.id, f]));
  fields.forEach((f, i) => {
    const known = byId.get(f?.id);
    if (!known) {
      errors.push(`devpost_form.fields[${i}].id "${f?.id}" is not in recon.submission_form.fields`);
      return;
    }
    if (known.limit != null && typeof f?.text === 'string' && f.text.length > known.limit) {
      errors.push(`devpost_form.fields[${i}] ("${f.id}") exceeds its ${known.limit}-character limit (${f.text.length} chars)`);
    }
  });
}

function crossCheckRequirementsTracker(tracker, errors, warnings, state) {
  const seeded = Array.isArray(state?.deliverables?.submission_requirements)
    ? state.deliverables.submission_requirements : null;
  if (seeded === null) {
    warnings.push(state ? 'state supplied but deliverables.submission_requirements is missing -- tracker completeness was not checked'
      : 'no state supplied -- devpost_form.requirements_tracker completeness was not checked');
    return;
  }
  const tracked = new Set(tracker.map((r) => r?.id));
  for (const d of seeded) {
    if (!tracked.has(d.id)) {
      errors.push(`state.deliverables.submission_requirements has "${d.id}" missing from devpost_form.requirements_tracker`);
    }
  }
}

function validateVideoScript(script, errors) {
  if (script === null || typeof script !== 'object' || Array.isArray(script)) {
    errors.push('video_script must be an object');
    return;
  }
  if (!(typeof script.total_seconds === 'number' && script.total_seconds > 0)) {
    errors.push('video_script.total_seconds must be a positive number');
  } else if (script.total_seconds > 180) {
    errors.push('video_script.total_seconds must not exceed 180 (sub-three-minute structure)');
  }
  const shots = Array.isArray(script.shots) ? script.shots : null;
  if (shots === null || shots.length === 0) {
    errors.push('video_script.shots must be a non-empty array');
    return;
  }
  let sum = 0;
  shots.forEach((s, i) => {
    if (!isNonEmptyString(s?.label)) errors.push(`video_script.shots[${i}].label must be a non-empty string`);
    if (!(typeof s?.seconds === 'number' && s.seconds > 0)) errors.push(`video_script.shots[${i}].seconds must be a positive number`);
    else sum += s.seconds;
    if (!isNonEmptyString(s?.script)) errors.push(`video_script.shots[${i}].script must be a non-empty string`);
    if (!isNonEmptyString(s?.on_screen)) errors.push(`video_script.shots[${i}].on_screen must be a non-empty string`);
  });
  if (typeof script.total_seconds === 'number' && sum !== script.total_seconds) {
    errors.push(`video_script.shots[].seconds must sum to total_seconds (got ${sum}, expected ${script.total_seconds})`);
  }
}

function validateScreenshots(screenshots, errors) {
  if (screenshots === null || typeof screenshots !== 'object' || Array.isArray(screenshots)) {
    errors.push('screenshots must be an object');
    return;
  }
  const shots = Array.isArray(screenshots.shots) ? screenshots.shots : null;
  if (shots === null) {
    errors.push('screenshots.shots must be an array');
    return;
  }
  shots.forEach((s, i) => {
    if (!isNonEmptyString(s?.id)) errors.push(`screenshots.shots[${i}].id must be a non-empty string`);
    if (!isNonEmptyString(s?.criterion_ref)) errors.push(`screenshots.shots[${i}].criterion_ref must be a non-empty string`);
    if (!isNonEmptyString(s?.instructions)) errors.push(`screenshots.shots[${i}].instructions must be a non-empty string`);
  });
}
