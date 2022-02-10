"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseOptions = exports.handleBuildAllCommand = exports.handleBuildTypeScriptCommand = exports.handleBuildReactCommand = void 0;
/** Build script to use esbuild without specifying 1000 CLI options */
const ansi_colors_1 = require("ansi-colors");
const esbuild_1 = require("esbuild");
const execa_1 = __importDefault(require("execa"));
const path_1 = __importDefault(require("path"));
const tiny_glob_1 = __importDefault(require("tiny-glob"));
// Build options
let watch;
let reactOptions;
let typescriptOptions;
function findTsc() {
    try {
        const packageJsonPath = require.resolve("typescript/package.json");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const packageJson = require(packageJsonPath);
        const binPath = packageJson.bin.tsc;
        return path_1.default.join(path_1.default.dirname(packageJsonPath), binPath);
    }
    catch (e) {
        console.error((0, ansi_colors_1.red)(`Could not find tsc executable: ${e.message}`));
        process.exit(1);
    }
}
/** Helper function to determine file paths that serve as input for React builds */
async function getReactFilePaths() {
    let entryPoints = await (0, tiny_glob_1.default)(`${reactOptions.rootDir}/${reactOptions.pattern}`);
    entryPoints = entryPoints.filter((ep) => !ep.endsWith(".d.ts") &&
        !ep.endsWith(".test.ts") &&
        !ep.endsWith(".test.tsx"));
    const tsConfigPath = `${reactOptions.rootDir}/${reactOptions.tsConfig}`;
    return { entryPoints, tsConfigPath };
}
/** Helper function to determine file paths that serve as input for TypeScript builds */
async function getTypeScriptFilePaths() {
    let entryPoints = await (0, tiny_glob_1.default)(`${typescriptOptions.rootDir}/${typescriptOptions.pattern}`);
    entryPoints = entryPoints.filter((ep) => !ep.endsWith(".d.ts") && !ep.endsWith(".test.ts"));
    const tsConfigPath = `${typescriptOptions.rootDir}/${typescriptOptions.tsConfig}`;
    return { entryPoints, tsConfigPath };
}
/** Type-checks the project with the given tsconfig path */
async function typeCheck(tsConfigPath) {
    console.log();
    console.log((0, ansi_colors_1.gray)(`Type-checking ${tsConfigPath} with tsc...`));
    const tscPath = findTsc();
    try {
        await execa_1.default.node(tscPath, `-p ${tsConfigPath} --noEmit`.split(" "), {
            stdout: "inherit",
            stderr: "inherit",
        });
        console.error((0, ansi_colors_1.green)(`✔ Type-checking ${tsConfigPath} succeeded!`));
        return true;
    }
    catch (e) {
        console.error((0, ansi_colors_1.red)(`❌ Type-checking ${tsConfigPath} failed!`));
        return false;
    }
}
function typeCheckWatch(tsConfigPath) {
    console.log();
    console.log((0, ansi_colors_1.gray)(`Type-checking ${tsConfigPath} with tsc in watch mode...`));
    const tscPath = findTsc();
    return execa_1.default.node(tscPath, `-p ${tsConfigPath} --noEmit --watch --preserveWatchOutput`.split(" "), {
        stdout: "inherit",
        stderr: "inherit",
    });
}
function getReactBuildOptions(entryPoints, tsConfigPath) {
    return {
        entryPoints,
        tsconfig: tsConfigPath,
        outdir: `${reactOptions.rootDir}/${(watch && reactOptions.watchDir) || reactOptions.outDir}`,
        bundle: reactOptions.bundle,
        format: reactOptions.format,
        target: reactOptions.compileTarget,
        minify: !watch,
        sourcemap: true,
        logLevel: "info",
        define: {
            "process.env.NODE_ENV": watch ? '"development"' : '"production"',
        },
    };
}
function getTypeScriptBuildOptions(entryPoints, tsConfigPath) {
    return {
        entryPoints,
        tsconfig: tsConfigPath,
        outdir: `${typescriptOptions.rootDir}/${typescriptOptions.outDir}`,
        bundle: typescriptOptions.bundle,
        minify: false,
        sourcemap: true,
        logLevel: "info",
        platform: "node",
        format: typescriptOptions.format || "cjs",
        target: typescriptOptions.compileTarget,
    };
}
async function buildReact() {
    const { entryPoints, tsConfigPath } = await getReactFilePaths();
    // Building React happens in one or two steps:
    // 1. fast compile with ESBuild
    console.log();
    console.log((0, ansi_colors_1.gray)("Compiling React with ESBuild..."));
    await (0, esbuild_1.build)(getReactBuildOptions(entryPoints, tsConfigPath));
    // 2. type-check with TypeScript (if there are TSX entry points)
    if (entryPoints.some((e) => e.endsWith(".tsx"))) {
        if (!(await typeCheck(tsConfigPath))) {
            process.exit(1);
        }
    }
}
async function buildTypeScript() {
    const { entryPoints, tsConfigPath } = await getTypeScriptFilePaths();
    // Building TS happens in two steps:
    // 1. fast compile with ESBuild
    console.log();
    console.log((0, ansi_colors_1.gray)("Compiling TypeScript with ESBuild..."));
    await (0, esbuild_1.build)(getTypeScriptBuildOptions(entryPoints, tsConfigPath));
    // 2. type-check with TypeScript
    if (!(await typeCheck(tsConfigPath))) {
        process.exit(1);
    }
}
async function buildAll() {
    await Promise.all([buildReact(), buildTypeScript()]);
}
async function watchReact() {
    const { entryPoints, tsConfigPath } = await getReactFilePaths();
    // Building React happens in one or two steps:
    // 1. fast compile with ESBuild
    console.log();
    console.log((0, ansi_colors_1.gray)("Compiling React with ESBuild in watch mode..."));
    const buildProcess = await (0, esbuild_1.build)({
        ...getReactBuildOptions(entryPoints, tsConfigPath),
        // We could run a separate type checking process after each successful
        // watch build, but keeping the process alive decreases the check time
        watch: true,
    });
    // 2. type-check with TypeScript (if there are TSX entry points)
    let checkProcess;
    if (entryPoints.some((e) => e.endsWith(".tsx"))) {
        checkProcess = typeCheckWatch(tsConfigPath);
    }
    return {
        build: buildProcess,
        check: checkProcess,
    };
}
async function watchTypeScript() {
    const { entryPoints, tsConfigPath } = await getTypeScriptFilePaths();
    // Building TS happens in two steps:
    // 1. fast compile with ESBuild
    console.log();
    console.log((0, ansi_colors_1.gray)("Compiling TypeScript with ESBuild..."));
    const buildProcess = await (0, esbuild_1.build)({
        ...getTypeScriptBuildOptions(entryPoints, tsConfigPath),
        // We could run a separate type checking process after each successful
        // watch build, but keeping the process alive decreases the check time
        watch: true,
    });
    // 2. type-check with TypeScript
    const checkProcess = typeCheckWatch(tsConfigPath);
    return {
        build: buildProcess,
        check: checkProcess,
    };
}
// Entry points for the CLI
async function handleBuildReactCommand() {
    if (watch) {
        // In watch mode, we start the ESBuild and TSC processes in parallel
        // and wait until they end
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { build, check } = await watchReact();
        return new Promise((resolve) => {
            check === null || check === void 0 ? void 0 : check.then(() => resolve()).catch(() => resolve());
            process.on("SIGINT", () => {
                console.log();
                console.log((0, ansi_colors_1.gray)("SIGINT received, shutting down..."));
                // build.stop?.();
                if (check) {
                    check.kill("SIGINT");
                }
                else {
                    resolve();
                }
            });
        });
    }
    else {
        await buildReact();
    }
}
exports.handleBuildReactCommand = handleBuildReactCommand;
async function handleBuildTypeScriptCommand() {
    if (watch) {
        // In watch mode, we start the ESBuild and TSC processes in parallel
        // and wait until they end
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { build, check } = await watchTypeScript();
        return new Promise((resolve) => {
            check.then(() => resolve()).catch(() => resolve());
            process.on("SIGINT", () => {
                console.log();
                console.log((0, ansi_colors_1.gray)("SIGINT received, shutting down..."));
                // build.stop?.();
                check.kill("SIGINT");
            });
        });
    }
    else {
        await buildTypeScript();
    }
}
exports.handleBuildTypeScriptCommand = handleBuildTypeScriptCommand;
async function handleBuildAllCommand() {
    if (watch) {
        // In watch mode, we start the ESBuild and TSC processes in parallel
        // and wait until they end
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { build: buildReact, check: checkReact } = await watchReact();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { build: buildTS, check: checkTS } = await watchTypeScript();
        return new Promise((resolve) => {
            Promise.all([checkReact, checkTS].filter(Boolean))
                .then(() => resolve())
                .catch(() => resolve());
            process.on("SIGINT", () => {
                console.log();
                console.log((0, ansi_colors_1.gray)("SIGINT received, shutting down..."));
                // buildReact.stop?.();
                // buildTS.stop?.();
                checkReact === null || checkReact === void 0 ? void 0 : checkReact.kill("SIGINT");
                checkTS.kill("SIGINT");
            });
        });
    }
    else {
        await buildAll();
    }
}
exports.handleBuildAllCommand = handleBuildAllCommand;
/******************************** Middlewares *********************************/
async function parseOptions(options) {
    watch = options.watch;
    reactOptions = {
        pattern: options.reactPattern,
        tsConfig: options.reactTsConfig,
        bundle: options.reactBundle,
        format: options.reactFormat,
        compileTarget: options.reactCompileTarget,
        rootDir: options.reactRootDir,
        outDir: options.reactOutDir,
        watchDir: options.reactWatchDir,
    };
    typescriptOptions = {
        pattern: options.typescriptPattern,
        tsConfig: options.typescriptTsConfig,
        bundle: options.typescriptBundle,
        format: options.typescriptFormat,
        compileTarget: options.typescriptCompileTarget,
        rootDir: options.typescriptRootDir,
        outDir: options.typescriptOutDir,
    };
}
exports.parseOptions = parseOptions;
//# sourceMappingURL=build-adapter-handlers.js.map