cli_sources = files(
    'src/main.cpp',
    'src/ProcessRunner.cpp',
    'src/LocalParser.cpp',
    'src/HeicModifier.cpp',
    'src/LocalConverter.cpp',
    'src/LocalTransporter.cpp'
)

cli_inc = include_directories('src')

executable(
    'livephotobridge',
    cli_sources,
    include_directories : cli_inc,
    dependencies : [core_dep, json_dep],
    install : true
)
