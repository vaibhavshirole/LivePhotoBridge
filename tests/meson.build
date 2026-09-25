test_core_exe = executable(
    'test_core',
    files('test_core.cpp'),
    dependencies : [core_dep, json_dep],
    install : false
)

test('core_tests', test_core_exe)
