export type Position = unknown;

type Node = {
  type: string;
  position?: Position;
};

export type Text = Node & {
  type: "text";
  value: string;
};

export type Emphasis = Node & {
  type: "emphasis";
  children: InlineNode[];
};

export type Strong = Node & {
  type: "strong";
  children: InlineNode[];
};

export type Delete = Node & {
  type: "delete";
  children: InlineNode[];
};

export type InlineCode = Node & {
  type: "inlineCode";
  value: string;
};

export type Link = Node & {
  type: "link";
  url: string;
  title?: string | null | undefined;
  children: InlineNode[];
};

export type Break = Node & {
  type: "break";
};

export type Html = Node & {
  type: "html";
  value: string;
};

export type InlineNode = Text | Emphasis | Strong | Delete | InlineCode | Link | Break | Html;

export type Paragraph = Node & {
  type: "paragraph";
  children: InlineNode[];
};

export type Heading = Node & {
  type: "heading";
  depth: number;
  children: InlineNode[];
};

export type ThematicBreak = Node & {
  type: "thematicBreak";
};

export type Blockquote = Node & {
  type: "blockquote";
  children: BlockNode[];
};

export type List = Node & {
  type: "list";
  ordered?: boolean | undefined;
  start?: number | null | undefined;
  spread?: boolean | undefined;
  children: ListItem[];
};

export type ListItem = Node & {
  type: "listItem";
  checked?: boolean | null | undefined;
  spread?: boolean | undefined;
  children: BlockNode[];
};

export type Code = Node & {
  type: "code";
  value: string;
  lang?: string | null | undefined;
  meta?: string | null | undefined;
};

export type TableCell = Node & {
  type: "tableCell";
  children: InlineNode[];
};

export type TableRow = Node & {
  type: "tableRow";
  children: TableCell[];
};

export type Table = Node & {
  type: "table";
  align?: Array<"left" | "right" | "center" | null> | undefined;
  children: TableRow[];
};

export type Definition = Node & {
  type: "definition";
  identifier: string;
  url?: string | undefined;
  title?: string | null | undefined;
};

export type BlockNode =
  | Paragraph
  | Heading
  | ThematicBreak
  | Blockquote
  | List
  | ListItem
  | Code
  | Table
  | Definition;

export type Root = Node & {
  type: "root";
  children: BlockNode[];
};
