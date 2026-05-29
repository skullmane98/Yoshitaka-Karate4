// Three default ID-card templates — Student / Team Class / Sensei.
// Each template defines the labels, accent color, and kanji defaults used
// when an admin selects that template for a user.
// Per-user overrides (`idcard_overrides`) stack on top of the template.
//
// IMPORTANT: this is the fallback only. The live source of truth is the
// `idcard-templates` CMS page, editable by admin/super_admin. The helpers
// below merge that page on top of these defaults.

export const IDCARD_TEMPLATES = {
  student: {
    label: "Student",
    description: "Standard member certificate.",
    config: {
      dojo_name: "Yoshitaka Karate-Do",
      certificate_title: "Student Member",
      kanji_top: "学生",
      kanji_bottom: "義孝",
      issued_text: "Issued · Yoshitaka Dojo",
      scan_text: "Scan to verify",
      name_label: "Member",
      role_label: "Role",
      rank_label: "Rank",
      footer_label: "Member No.",
      accent_color: "#D7263D",
      title_bg_color: "#FFF1D6",
      title_text_color: "#0F0F0F",
    },
  },
  team_class: {
    label: "Team Class",
    description: "For students enrolled in special team / competition track.",
    config: {
      dojo_name: "Yoshitaka Karate-Do",
      certificate_title: "Team Class Member",
      kanji_top: "選手",
      kanji_bottom: "義孝",
      issued_text: "Team Class · Yoshitaka Dojo",
      scan_text: "Scan to verify",
      name_label: "Athlete",
      role_label: "Track",
      rank_label: "Rank",
      footer_label: "Roster No.",
      accent_color: "#1E5BA8",
      title_bg_color: "#DBE8F7",
      title_text_color: "#0F0F0F",
    },
  },
  sensei: {
    label: "Sensei",
    description: "For instructors (Sensei / Renshi / Team Member).",
    config: {
      dojo_name: "Yoshitaka Karate-Do",
      certificate_title: "Instructor Credential",
      kanji_top: "先生",
      kanji_bottom: "義孝",
      issued_text: "Faculty · Yoshitaka Dojo",
      scan_text: "Scan to verify",
      name_label: "Instructor",
      role_label: "Title",
      rank_label: "Dan / Rank",
      footer_label: "Faculty No.",
      accent_color: "#0F0F0F",
      title_bg_color: "#EAEAEA",
      title_text_color: "#0F0F0F",
    },
  },
};

/**
 * Merge live (CMS-stored) template config on top of the JS fallback so
 * editing a template's defaults via the Templates editor takes effect
 * for every user assigned that template.
 */
export function mergeTemplates(cmsTemplates) {
  const out = {};
  const keys = new Set([
    ...Object.keys(IDCARD_TEMPLATES),
    ...Object.keys(cmsTemplates || {}),
  ]);
  for (const k of keys) {
    const fallback = IDCARD_TEMPLATES[k] || {};
    const cms = (cmsTemplates && cmsTemplates[k]) || {};
    out[k] = {
      label: cms.label || fallback.label || k,
      description: cms.description || fallback.description || "",
      config: { ...(fallback.config || {}), ...(cms.config || {}) },
    };
  }
  return out;
}

export function resolveIDCardDesign(globalCMS, user, cmsTemplates) {
  const base = globalCMS || {};
  const merged = mergeTemplates(cmsTemplates);
  const tmplKey = user?.idcard_template;
  const tmpl = tmplKey && merged[tmplKey] ? merged[tmplKey].config : {};
  const userOverridesRaw = user?.idcard_overrides || {};
  // Strip empty/whitespace-only override values so an unfilled drawer input
  // doesn't shadow the template default. Numbers (0) and explicit `false`
  // are kept — only blank strings and null/undefined are treated as "use
  // the template's value".
  const userOverrides = {};
  for (const [k, v] of Object.entries(userOverridesRaw)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    userOverrides[k] = v;
  }
  return { ...base, ...tmpl, ...userOverrides };
}
