workspace "Letant" {
    description "Software System Architecture of Letant."

    !identifiers hierarchical

    model {
        archetypes {
            async = -> "Asynchronous" {
                tags "Async"
            }
            sync = -> "Synchronous" {
                tags "Sync"
            }

            module = component {
                tags "Module"
            }

            json = element {
                tags "JSON"
            }

            file = element {
                tags "File"
            }

            fs = --async-> {
                technology "File System"
            }
            call = --sync-> {
                technology "Function Call"
            }
            return = --sync-> {
                technology "Returns"
            }
        }

        l = softwareSystem "Letant" {
            !docs README.md
            !decisions ./architecture/decisions
            description "A structural code comprehension assistance."

            letant = container "letant" {
                description "A core engine that manages graph construction."
                technology "Node"

                group "Core" {
                    plugin = module "Plugin" {
                        description "An instance that carries letant plugin descriptor for each."
                    }
                    pluginHandler = module "Plugin Handler" {
                        description "A middle layer that bridges between workspace and plugin."
                    }
                    graph = module "Graph" {
                        description "A graph data structure constructed by nodes and edges."
                    }
                    cursor = module "Graph Cursor" {
                        description "A cursor for graph traversal."
                    }
                }

                group "Workspace" {
                    ws = module "Workspace" {
                        description "An application surface where the core engine runs."
                    }
                }

                group "Config" {
                    loader = module "Configuration Loader" {
                        description "An initializer of letant, reading configuration json."
                    }
                }
            }

            cli = container "@letant/cli" {
                description "Command-line interface for letant"
                technology "Node, commander"
                tags "CLI"
            }

            group "Language Plugins" {
                js = container "@letant/js" {
                    description "A javascript plugin for letant"
                    technology "Node"

                    queryString = module "Tree-sitter Query String" {
                        description "A query strings"
                        technology "Tree-sitter, scm"
                    }

                    capture = module "Capture" {
                        description "Dispatches actions on running tree-sitter queries."
                        technology "Node"
                    }

                    convert = module "Convert" {
                        description "Dispatches actions for each conversion of query results."
                    }

                    query = module "Query" {
                        description "A map of queries."
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

        l.letant.loader --fs-> configJSON "Reads from"
        l.cli --fs-> source "Reads from"
        l.letant.plugin --call-> ts "Initializes"
        l.js.query --call-> ts "Gets language specification from"

        l.cli --call-> l.letant.loader "Calls"
        l.letant.loader --return-> l.cli "Returns"

        l.cli --call-> l.letant.ws "Initializes"
        l.letant.ws --call-> l.letant.pluginHandler "Initializes"
        l.letant.pluginHandler --call-> l.letant.plugin "Initializes"
        l.letant.plugin --call-> l.js "Gets descriptor of"

        l.js.query --sync-> l.js.queryString "Uses"
        l.js.query --call-> l.js.capture "Dispatches to"
        l.js.capture --call-> l.js.convert "Passes result to"
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