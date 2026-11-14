// Small arithmetic interpreter. Expressions are data; never JavaScript.
type Node =
  | { kind: "number"; value: number }
  | { kind: "name"; value: string }
  | { kind: "unary"; value: string; child: Node }
  | { kind: "binary"; value: string; left: Node; right: Node }
  | { kind: "call"; value: string; child: Node };
const functions: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  log: Math.log,
};
export function compileExpression(
  source: string,
  allowed: string[] = [],
  onParsed?: (root: Node) => void,
): (variables: Record<string, number>) => number {
  if (source.length > 256) throw Error("Biểu thức quá dài");
  const tokens =
    source.match(
      /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[a-zA-Z_]\w*|[+\-*/^()]/g,
    ) || [];
  if (tokens.join("") !== source.replace(/\s/g, ""))
    throw Error("Ký tự không được hỗ trợ");
  let pos = 0;
  const names = new Set(["x", "pi", ...allowed]);
  function primary(): Node {
    const t = tokens[pos++];
    if (t === "+" || t === "-")
      return { kind: "unary", value: t, child: parse(3) };
    if (t === "(") {
      const n = parse(0);
      if (tokens[pos++] !== ")") throw Error("Thiếu dấu )");
      return n;
    }
    if (t && /^(?:\d|\.)/.test(t)) return { kind: "number", value: Number(t) };
    if (t && Object.hasOwn(functions, t)) {
      if (tokens[pos++] !== "(") throw Error("Hàm cần dấu (");
      const n = parse(0);
      if (tokens[pos++] !== ")") throw Error("Thiếu dấu )");
      return { kind: "call", value: t, child: n };
    }
    if (t && names.has(t)) return { kind: "name", value: t };
    throw Error(`Biến không hợp lệ: ${t}`);
  }
  function parse(min: number): Node {
    let left = primary();
    while (pos < tokens.length) {
      const op = tokens[pos];
      const p =
        op === "+" || op === "-"
          ? 1
          : op === "*" || op === "/"
            ? 2
            : op === "^"
              ? 4
              : 0;
      if (p === 0 || p < min) break;
      pos++;
      left = {
        kind: "binary",
        value: op,
        left,
        right: parse(op === "^" ? p : p + 1),
      };
    }
    return left;
  }
  const root = parse(0);
  if (pos !== tokens.length) throw Error("Biểu thức không hợp lệ");
  onParsed?.(root);
  function run(n: Node, v: Record<string, number>): number {
    switch (n.kind) {
      case "number":
        return n.value;
      case "name":
        return n.value === "pi" ? Math.PI : v[n.value];
      case "unary":
        return (n.value === "-" ? -1 : 1) * run(n.child, v);
      case "call":
        return functions[n.value](run(n.child, v));
      case "binary": {
        const a = run(n.left, v),
          b = run(n.right, v);
        return n.value === "+"
          ? a + b
          : n.value === "-"
            ? a - b
            : n.value === "*"
              ? a * b
              : n.value === "/"
                ? a / b
                : a ** b;
      }
    }
  }
  return (v) => run(root, v);
}

/** Structural polynomial analysis, not numerical interpolation of arbitrary functions. */
export function polynomialCoefficients(source: string, values: Record<string, number> = {}): number[] | null {
  try {
    let root: Node | undefined;
    compileExpression(source, Object.keys(values), n => { root = n; });
    const trim=(p:number[])=>{while(p.length>1 && p.at(-1)===0)p.pop();return p;};
    const multiply=(a:number[],b:number[])=>{
      if(a.length+b.length-2>3)throw Error("Degree not supported");
      const p=Array(a.length+b.length-1).fill(0) as number[];
      a.forEach((v,i)=>b.forEach((w,j)=>{p[i+j]+=v*w;}));return trim(p);
    };
    const visit=(n:Node):number[]=>{
      if(n.kind==="number")return [n.value];
      if(n.kind==="name")return n.value==="x" ? [0,1] : [n.value==="pi" ? Math.PI : values[n.value]];
      if(n.kind==="call")throw Error("Not a polynomial construction");
      if(n.kind==="unary")return visit(n.child).map(v=>n.value==="-" ? -v : v);
      const a=visit(n.left),b=visit(n.right);
      if(n.value==="+" || n.value==="-")return trim(Array.from({length:Math.max(a.length,b.length)},(_,i)=>(a[i]||0)+(n.value==="+" ? 1 : -1)*(b[i]||0)));
      if(n.value==="*")return multiply(a,b);
      if(n.value==="/"){if(b.length!==1 || !b[0])throw Error("Variable denominator");return a.map(v=>v/b[0]);}
      if(b.length!==1 || !Number.isInteger(b[0]) || b[0]<0 || b[0]>3)throw Error("Invalid power");
      let p=[1];for(let i=0;i<b[0];i++)p=multiply(p,a);return p;
    };
    const result=visit(root!);return result.every(Number.isFinite) ? result : null;
  } catch { return null; }
}
