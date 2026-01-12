import { transform, PluginItem } from "@babel/core";
import jsx from "@babel/plugin-syntax-jsx";

export const transformWithPlugins = async (
  code: string,
  plugins: PluginItem[]
): Promise<string> => {
  return await new Promise((resolve, reject) =>
    transform(
      code,
      {
        plugins: [jsx, ...plugins],
        parserOpts: {
          sourceType: "unambiguous",
          allowImportExportEverywhere: true,
          allowReturnOutsideFunction: true,
          plugins: ["jsx", "typescript"]
        },
        compact: false,
        minified: false,
        comments: false,
        sourceMaps: false,
        retainLines: false
      },
      (err, result) => {
        if (err || !result) {
          reject(err);
        } else {
          resolve(result.code as string);
        }
      }
    )
  );
};
