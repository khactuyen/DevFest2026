import type { Entry } from "./types";
import { Vector3 } from "three";

export function objectMeasurements(
  entry: Entry,
  values: Record<string, number>,
) {
  const object = entry.object;
  if (object.type === "label3d")
    return [`Nhãn dữ kiện: ${object.text || object.label || object.id}`];
  if (object.type === "face3d")
    return [
      `Mặt phẳng/mặt tam giác ${object.label || object.id}.`,
      `${object.points3d?.length || 3} đỉnh của mặt được giữ trong hệ tọa độ không gian.`,
    ];
  if (object.type === "polyhedron3d" && object.faces3d) {
    let volume = 0;
    const origin = new Vector3(...object.faces3d[0][0]);
    for (const face of object.faces3d) {
      const a = new Vector3(...face[0]).sub(origin);
      for (let i = 1; i + 1 < face.length; i++) {
        const b = new Vector3(...face[i]).sub(origin);
        const c = new Vector3(...face[i + 1]).sub(origin);
        volume += a.dot(b.cross(c)) / 6;
      }
    }
    return [`Thể tích ≈ ${Math.abs(volume).toLocaleString("vi-VN", { maximumFractionDigits: 4 })}`];
  }
  const valuesForObject = object.parameterBindings || {};
  const size = valuesForObject.size
    ? values[valuesForObject.size]
    : object.size || 2;
  const radius = valuesForObject.radius
    ? values[valuesForObject.radius]
    : object.radius || size / 2;
  const height = valuesForObject.height
    ? values[valuesForObject.height]
    : object.height || size;
  const depth = valuesForObject.depth
    ? values[valuesForObject.depth]
    : object.depth || 1;
  const sides = Math.round(
    valuesForObject.sides ? values[valuesForObject.sides] : object.sides || 6,
  );
  if(object.type === "box" && object.boxDimensions){const [a,b,c]=object.boxDimensions;return [`Kích thước = ${a} × ${b} × ${c}`,`Diện tích toàn phần = ${2*(a*b+b*c+c*a)}`,`Thể tích = ${a*b*c}`];}
  if (object.type === "box")
    return [
      `Cạnh a = ${size.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
      `Diện tích toàn phần = ${(6 * size * size).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
      `Thể tích = ${(size ** 3).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
    ];
  if (object.type === "sphere")
    return [
      `Bán kính r = ${radius.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
      `Diện tích mặt cầu = ${(4 * Math.PI * radius ** 2).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
      `Thể tích = ${((4 * Math.PI * radius ** 3) / 3).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
    ];
  if (object.type === "cylinder")
    return [
      `Bán kính đáy r = ${radius.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
      `Chiều cao h = ${height.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
      `Thể tích = ${(Math.PI * radius ** 2 * height).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
    ];
  if (object.type === "cone")
    return [
      `Bán kính đáy r = ${radius.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
      `Chiều cao h = ${height.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
      `Thể tích = ${((Math.PI * radius ** 2 * height) / 3).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
    ];
  if(object.type === "prism" && object.topRadius!==undefined){const top=object.topRadius,coefficient=sides*Math.sin(2*Math.PI/sides)/2;return [`Chóp cụt đều · ${sides} cạnh đáy`,`Chiều cao h = ${height}`,`Thể tích = ${(coefficient*height*(radius*radius+top*top+radius*top)/3).toLocaleString("vi-VN",{maximumFractionDigits:4})}`];}
  if (object.type === "prism")
    return [
      `Số cạnh đáy n = ${sides}`,
      `Chiều cao h = ${height.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
      `Thể tích = diện tích đáy × h (đáy đều: ${(((sides * radius ** 2 * Math.sin((2 * Math.PI) / sides)) / 2) * height).toLocaleString("vi-VN", { maximumFractionDigits: 2 })})`,
    ];
  if (object.type === "pyramid") {
    const apexHeight = height + (object.apexOffset?.[1] ?? 0);
    return [
      `Số cạnh đáy n = ${sides}`,
      `Chiều cao h = ${apexHeight.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
      `Thể tích = diện tích đáy × h / 3 (đáy đều: ${(((sides * radius ** 2 * Math.sin((2 * Math.PI) / sides)) / 6) * apexHeight).toLocaleString("vi-VN", { maximumFractionDigits: 2 })})`,
    ];
  }
  if (object.type === "extrudedPolygon") {
    const vertices = object.vertices2d || [];
    const perimeter = vertices.reduce((sum, point, index) => {
      const next = vertices[(index + 1) % vertices.length];
      return sum + Math.hypot(next[0] - point[0], next[1] - point[1]);
    }, 0);
    const area =
      Math.abs(
        vertices.reduce((sum, point, index) => {
          const next = vertices[(index + 1) % vertices.length];
          return sum + point[0] * next[1] - next[0] * point[1];
        }, 0),
      ) / 2;
    return [
      `Diện tích đáy ≈ ${area.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
      `Chu vi đáy ≈ ${perimeter.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
      `Chiều sâu = ${depth.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
      `Thể tích ≈ ${(area * depth).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
    ];
  }
  if (object.type === "curve3d")
    return [
      "Đường cong được biểu diễn trong không gian 3D.",
      "Các điểm của nét vẽ nằm trên mặt phẳng tọa độ.",
    ];
  const counts: Record<string, string> = {
    tetrahedron: "4 mặt · 6 cạnh · 4 đỉnh",
    octahedron: "8 mặt · 12 cạnh · 6 đỉnh",
    dodecahedron: "12 mặt · 30 cạnh · 20 đỉnh",
    icosahedron: "20 mặt · 30 cạnh · 12 đỉnh",
  };
  return counts[object.type]
    ? [
        counts[object.type],
        `Kích thước tham số = ${size.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
      ]
    : [];
}
