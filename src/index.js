/**
 * Gleam plugin to typescript lsp.
 */

import { resolve, dirname } from "node:path";

import {
  projectNew,
  projectConfig,
  readTs,
  existsTs,
  resolveTs,
  isGleamFile,
} from "core-plugin-gleam";

function init(modules) {
  const ts = modules.typescript;

  function create(info) {
    const logger = (msg, error = false) =>
      info.project.projectService.logger.info(
        `[${info.config.name}-log]${error ? " ERROR | " : " "}${msg}`);

    const directory = info.project.getCurrentDirectory();
    process.chdir(directory);
    logger(`Init ${directory}`);
    const project = projectNew(info.config);
    logger(`Project ${JSON.stringify(project)}`);
    const config = projectConfig(project);
    logger(`Config ${JSON.stringify(config)}`);

    const languageServiceHost = {};
    const languageServiceHostProxy = new Proxy(info.languageServiceHost, {
      get(target, key) {
        return languageServiceHost[key]
          ? languageServiceHost[key]
          : target[key];
      },
    });

    const languageService = ts.createLanguageService(languageServiceHostProxy);

    let projectName = config.name;

    if (!projectName) {
      logger("Not found gleam project name", true);
      return languageService;
    }

    if (config.javascript?.typescript_declarations !== true) {
      logger("Gleam typescript declarations not enabled", true);
      return languageService;
    }

    languageServiceHost.getScriptKind = (fileName) => {
      if (!info.languageServiceHost.getScriptKind) {
        logger(`Unknown script kind: ${fileName}`, true)
        return ts.ScriptKind.Unknown;
      }
      if (
        fileName.includes(project.dir.out) &&
        existsTs(projectName, fileName, project)
      ) {
        logger(`Script kind TS: ${fileName}`);
        return ts.ScriptKind.TS;
      }
      const kind = info.languageServiceHost.getScriptKind(fileName);
      return kind;
    };

    languageServiceHost.getScriptSnapshot = (fileName) => {
      if (
        fileName.includes(project.dir.out) &&
        existsTs(projectName, fileName, project)
      ) {
        const _file = readTs(projectName, fileName, project);
        const dts = ts.ScriptSnapshot.fromString(_file);

        logger(`Script snap: ${fileName}`);
        return dts;
      }
      return info.languageServiceHost.getScriptSnapshot(fileName);
    };

    function createModuleResolver(containingFile) {
      return (
        moduleName,
        _resolveModule,
      ) => {
        if (isGleamFile(moduleName.text)) {
          const _path = resolve(dirname(containingFile), moduleName.text);
          const resolvedFileName = resolveTs(projectName, _path, project);
          logger(`Module resolver path=${_path} to gleam=${resolvedFileName}`)
          return {
            resolvedUsingTsExtension: false,
            isExternalLibraryImport: false,
            extension: ".mjs",
            resolvedFileName,
          };
        }
      };
    }

    if (info.languageServiceHost.resolveModuleNameLiterals) {
      const _resolveModuleNameLiterals =
        info.languageServiceHost.resolveModuleNameLiterals.bind(
          info.languageServiceHost,
        );
      languageServiceHost.resolveModuleNameLiterals = (
        modulesLiterals,
        containingFile,
        ...rest
      ) => {
        const resolvedModules = _resolveModuleNameLiterals(
          modulesLiterals,
          containingFile,
          ...rest,
        );

        const moduleResolver = createModuleResolver(containingFile);

        return modulesLiterals.map((moduleName, index) => {
          try {
            const resolvedModule = moduleResolver(
              moduleName,
              () =>
                languageServiceHost.getResolvedModuleWithFailedLookupLocationsFromCache?.(
                  moduleName.text,
                  containingFile,
                ),
            );

            if (resolvedModule) {
              return { resolvedModule }
            };
          } catch (e) {
            logger(`${e}`, true);
            return resolvedModules[index];
          }
          return resolvedModules[index];
        });
      };
    }

    logger("Finish gleam typescript lsp");
    return languageService;
  }

  function getExternalFiles(project) {
    return project.getFileNames().filter(isGleamFile);
  }

  return { create, getExternalFiles };
}

module.exports = init;
