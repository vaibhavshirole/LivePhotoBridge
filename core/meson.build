core_inc = include_directories('include')

core_sources = files(
    'src/PhotoMuxer.cpp',
    'src/JpegModifier.cpp'
)

core_lib = static_library(
    'livephotobridge_core',
    core_sources,
    include_directories : core_inc,
    install : false
)

core_dep = declare_dependency(
    link_with : core_lib,
    include_directories : core_inc
)
