project(
    'LivePhotoBridge',
    'cpp',
    version : '1.0.0',
    default_options : [
        'cpp_std=c++20',
        'warning_level=2',
        'optimization=3'
    ]
)

# On macOS, ensure the active SDK's C++ standard library headers are used
if host_machine.system() == 'darwin'
    xcrun = find_program('xcrun', required : false)
    if xcrun.found()
        sdk_path = run_command(xcrun, '--show-sdk-path', check : true).stdout().strip()
        cxx_headers = sdk_path / 'usr/include/c++/v1'
        add_project_arguments('-isysroot', sdk_path, '-isystem', cxx_headers, language : 'cpp')
        add_project_link_arguments('-isysroot', sdk_path, language : 'cpp')
    endif
endif

# JSON Dependency: Meson WrapDB or system dependency
json_dep = dependency('nlohmann_json', fallback : ['nlohmann_json', 'nlohmann_json_dep'])

subdir('core')
subdir('cli')
subdir('tests')
