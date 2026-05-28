// Three default ID-card templates — Student / Team Class / Sensei.
// Each template defines the labels, accent color, and kanji defaults used
// when an admin selects that template for a user.
// Per-user overrides (`idcard_overrides`) stack on top of the template.

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
      title_bg_color: "#FFF1D6",  // warm cream — readable against any background image
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
      title_bg_color: "#DBE8F7",  // light steel-blue tint of the team accent
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
      title_bg_color: "#EAEAEA",  // soft warm gray for the formal faculty card
    },
  },
};

export function resolveIDCardDesign(globalCMS, user) {
  const base = globalCMS || {};
  const tmplKey = user?.idcard_template;
  const tmpl = tmplKey && IDCARD_TEMPLATES[tmplKey] ? IDCARD_TEMPLATES[tmplKey].config : {};
  const userOverrides = user?.idcard_overrides || {};
  return { ...base, ...tmpl, ...userOverrides };
}
