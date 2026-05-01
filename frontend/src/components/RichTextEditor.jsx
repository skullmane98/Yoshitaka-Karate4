import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";
import {
  Bold, Italic, Heading2, Heading3, List, ListOrdered, Link2, Quote, Undo2, Redo2,
} from "lucide-react";

/**
 * Lightweight rich text editor for CMS long-form fields.
 * Outputs HTML via onChange.
 */
export default function RichTextEditor({ value, onChange, placeholder, minHeight = 160, testid }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
        link: false,
      }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "underline" } }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange?.(html === "<p></p>" ? "" : html);
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none px-4 py-3",
        style: `min-height:${minHeight}px`,
        "data-testid": testid || "rte-content",
      },
    },
  });

  // Keep editor synced with external value updates (e.g., switching pages)
  useEffect(() => {
    if (!editor) return;
    if ((value || "") !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  const Btn = ({ active, onClick, children, label }) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      data-testid={`rte-btn-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className={`px-2 py-1 text-xs border border-[var(--dojo-border)] transition-colors ${
        active ? "bg-[var(--dojo-ink)] text-white border-[var(--dojo-ink)]" : "bg-[var(--dojo-input-bg)] text-[var(--dojo-ink)] hover:border-[var(--dojo-ink)]"
      }`}
    >
      {children}
    </button>
  );

  const setLink = () => {
    const url = window.prompt("URL:");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  };

  return (
    <div className="border border-[var(--dojo-border)] bg-[var(--dojo-input-bg)]" data-testid="rte-root">
      <div className="flex flex-wrap gap-1 p-2 border-b border-[var(--dojo-border)] bg-[var(--dojo-paper-alt)]">
        <Btn label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={13} /></Btn>
        <Btn label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={13} /></Btn>
        <span className="w-px h-5 bg-[var(--dojo-border)] mx-1 self-center" />
        <Btn label="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={13} /></Btn>
        <Btn label="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={13} /></Btn>
        <span className="w-px h-5 bg-[var(--dojo-border)] mx-1 self-center" />
        <Btn label="Bullet List" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={13} /></Btn>
        <Btn label="Ordered List" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={13} /></Btn>
        <Btn label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={13} /></Btn>
        <span className="w-px h-5 bg-[var(--dojo-border)] mx-1 self-center" />
        <Btn label="Link" active={editor.isActive("link")} onClick={setLink}><Link2 size={13} /></Btn>
        <span className="w-px h-5 bg-[var(--dojo-border)] mx-1 self-center" />
        <Btn label="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo2 size={13} /></Btn>
        <Btn label="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo2 size={13} /></Btn>
      </div>
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  );
}
