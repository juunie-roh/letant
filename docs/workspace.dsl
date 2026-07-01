workspace "Letant" {
    !docs "workspace-docs"
    description "Software System Architecture of Letant."

    !identifiers hierarchical

    model {
        archetypes {
            module = component {
                technology "Node.js"
                tags "Module"
            }
            # Custom Entities
            json = element {
                tags "JSON"
            }
            file = element {
                tags "File"
            }
            # Static Relationships
            use = -> {
                tags "Use"
            }
            init = --use-> {
                tags "Initialize"
            }
            # Dynamic Relationships
            ## Primitive Relationships
            async = -> "Asynchronous" {
                tags "Async"
            }
            sync = -> "Synchronous" {
                tags "Sync"
            }
            ## Derived Relationships
            call = --sync-> {
                technology "Call"
            }
            return = --sync-> {
                technology "Return"
            }
            fs = --async-> {
                technology "File System"
            }
            restApi = --async-> {
                technology "RESTful API"
            }
        }

        l = softwareSystem "Letant" {
            !docs README.md
            !decisions ./architecture/decisions
            description "A structural code comprehension assistance."

            letant = container "letant" {
                description "A core engine that manages graph construction."
                technology "Node.js"

                group "Core" {
                    plugin = module "Plugin" {
                        description "Wraps a language plugin descriptor, bridging a plugin package with the core engine."
                    }
                    pluginHandler = module "Plugin Handler" {
                        description "A middle layer that bridges between workspace and plugin."
                    }
                    graph = module "Graph" {
                        description "A declaration graph of name bindings and scope boundaries parsed from a source file."
                    }
                    cursor = module "Graph Cursor" {
                        description "A cursor for graph traversal."
                    }
                }

                group "Workspace" {
                    ws = module "Workspace" {
                        description "An application layer where the core engine runs. Caches graphs mapped with file paths."
                    }
                }

                group "Config" {
                    loader = module "Configuration Loader" {
                        description "Reads letant.config.json and resolves language plugin packages by file extension."
                    }
                }
            }

            cli = container "@letant/cli" {
                description "Command-line interface for letant"
                technology "Node.js, commander"
                tags "CLI"
            }

            group "Language Plugins" {
                js = container "@letant/js" {
                    description "Implements the letant plugin interface for JavaScript using Tree-sitter queries, captures, and conversions."
                    technology "Node.js"

                    queryString = module "Tree-sitter Query String" {
                        description "Tree-sitter query strings for detecting JavaScript scope boundaries and name bindings."
                        technology "Tree-sitter, scm"
                        properties {
                            "path" "packages/js/src/queries"
                        }
                    }

                    capture = module "Capture" {
                        description "Dispatches actions on running Tree-sitter queries."
                        properties {
                            "path" "packages/js/src/capture.ts"
                        }
                    }

                    convert = module "Convert" {
                        description "Dispatches actions for each conversion of query results."
                        properties {
                            "path" "packages/js/src/convert.ts"
                        }
                    }

                    query = module "Query" {
                        description "Executes mapped Tree-sitter queries."
                        properties {
                            "path" "packages/js/src/query.ts"
                        }
                    }
                }
            }
        }

        ts = softwareSystem "Tree-sitter" {
            description "An AST generator with language plugins."
        }

        # External Input Sources
        configJSON = json "letant.config.json" {
            description "A configuration for letant."
        }
        source = file "Source File" {
            description "A target source file with raw texts to process with letant."
        }

        # Environments
        cliEnv = deploymentEnvironment "CLI" {
            deploymentNode "User Machine" {
                description "A device of user."
                technology "Windows, macOS, Linux, ..."

                deploymentNode "Node.js Runtime" {
                    description "A Node.js runtime environment where tree-sitter provides bindings."
                    technology "Node.js >= 22"

                    instanceOf l.cli
                }
            }
        }
        # External system relationships
        l.letant.loader --fs-> configJSON "Reads configuration from"
        l.cli --fs-> source "Reads source text from"
        l.letant.plugin --init-> ts "Initializes parser using"
        l.js.query --use-> ts "Gets language specification from"
        # Initializing relationships using CLI
        l.cli --use-> l.letant.loader "Gets letant configuration from"
        # Initializing relationships of the core engine
        l.cli --init-> l.letant.ws "Initializes workspace using"
        l.letant.ws --init-> l.letant.pluginHandler "Initializes plugin handler using"
        l.letant.pluginHandler --init-> l.letant.plugin "Initializes plugin using"
        l.letant.plugin --use-> l.js "Gets descriptor of"
        # Plugin workflows
        l.js.query --use-> l.js.queryString "Maps query configurations with"
        l.js.capture --use-> l.js.query "Dispatches to"
        l.js.convert --use-> l.js.capture "Gets result from"
    }

    views {
        systemContext l "SystemContext" {
            include *
            exclude configJSON source
        }

        container l "Container" {
            include *
        }

        component l.letant "CoreEngine" {
            include *
        }

        component l.js "Plugin" {
            include *
        }

        deployment l cliEnv "Deployment-CLI" {
            include *
        }

        styles {
            element "JSON" {
                shape Shell
            }
            element "Module" {
                shape Component
            }
            element "File" {
                shape Folder
            }
            element "CLI" {
                shape Terminal
            }
        }
    }


    configuration {
        scope softwaresystem
    }
}