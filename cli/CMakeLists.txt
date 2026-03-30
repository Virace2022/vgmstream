# CLI

add_executable(vgmstream_cli
	vgmstream_cli.c vgmstream_cli_utils.c wav_utils.c windows_utils.c)

set_target_properties(vgmstream_cli PROPERTIES
	PREFIX ""
	OUTPUT_NAME "vgmstream-cli")

# Link to the vgmstream library
target_link_libraries(vgmstream_cli PUBLIC libvgmstream)


setup_target(vgmstream_cli TRUE)

if(WIN32)
	# Add the preprocessor definitions
	target_compile_definitions(vgmstream_cli PRIVATE _CONSOLE UNICODE _UNICODE VGM_STDIO_UNICODE)

	# Link to the getopt library
	target_link_libraries(vgmstream_cli PUBLIC getopt)

	# Make sure that the binary directory is included (for version.h), as well as the getopt library include directory
	target_include_directories(vgmstream_cli PRIVATE
		${VGM_BINARY_DIR}
		${VGM_SOURCE_DIR}/ext_libs/Getopt)

	# Include the version string
	if(MSVC)
		add_dependencies(vgmstream_cli version_h)
	elseif(MINGW)
		if(VGMSTREAM_VERSION)
			target_compile_definitions(vgmstream_cli PRIVATE VGMSTREAM_VERSION="${VGMSTREAM_VERSION}")
		endif()

		# Also, on MinGW when using GCC, these flags need to be included to prevent requiring MinGW's runtime DLLs from being included, which does unfortunately increase the size of the EXE
		if(NOT CMAKE_CXX_COMPILER_ID MATCHES Clang)
			set_target_properties(vgmstream_cli PROPERTIES
				LINK_FLAGS "-static-libgcc -static-libstdc++")
		endif()
	endif()

	# Install the DLLs
	install_dlls(${CMAKE_INSTALL_PREFIX}/bin)
elseif(VGMSTREAM_VERSION)
	# Include the version string
	target_compile_definitions(vgmstream_cli PRIVATE VGMSTREAM_VERSION="${VGMSTREAM_VERSION}")
endif()

if(CMAKE_CXX_COMPILER_ID MATCHES Clang OR CMAKE_CXX_COMPILER_ID MATCHES GNU)
	set_target_properties(vgmstream_cli PROPERTIES LINK_FLAGS_RELEASE -s)
endif()

# Install the CLI program
install(TARGETS vgmstream_cli
	RUNTIME DESTINATION ${CMAKE_INSTALL_PREFIX}/bin)

add_executable(vgmstream_wasm_min_smoke
	vgmstream_wasm_min_smoke.c)

set_target_properties(vgmstream_wasm_min_smoke PROPERTIES
	PREFIX ""
	OUTPUT_NAME "vgmstream_wasm_min_smoke")

target_link_libraries(vgmstream_wasm_min_smoke PUBLIC
	vgmstream_wasm_min_core)

target_compile_definitions(vgmstream_wasm_min_smoke PRIVATE VGM_WASM_MIN)

setup_target(vgmstream_wasm_min_smoke TRUE)

install(TARGETS vgmstream_wasm_min_smoke
	RUNTIME DESTINATION ${CMAKE_INSTALL_PREFIX}/bin)

if(EMSCRIPTEN AND BUILD_WASM_MIN)
	add_executable(vgmstream_wasm_min
		vgmstream_wasm_min_exports.c)

	set_target_properties(vgmstream_wasm_min PROPERTIES
		PREFIX ""
		OUTPUT_NAME "vgmstream_wasm_min"
		LINK_FLAGS_RELEASE "-Oz -flto -sFILESYSTEM=0 -sMALLOC=emmalloc -sASSERTIONS=0 -sSUPPORT_ERRNO=0 -sEXPORTED_FUNCTIONS=['_malloc','_free','_vgmstream_web_convert','_vgmstream_web_free_result'] -sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString'] -sINCOMING_MODULE_JS_API=[]"
		LINK_FLAGS "-flto -sFILESYSTEM=0 -sMALLOC=emmalloc -sASSERTIONS=0 -sSUPPORT_ERRNO=0 -sEXPORTED_FUNCTIONS=['_malloc','_free','_vgmstream_web_convert','_vgmstream_web_free_result'] -sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString'] -sINCOMING_MODULE_JS_API=[]")

	target_link_libraries(vgmstream_wasm_min PUBLIC
		vgmstream_wasm_min_core)

	target_compile_definitions(vgmstream_wasm_min PRIVATE VGM_WASM_MIN)
	target_compile_options(vgmstream_wasm_min PRIVATE -Oz -flto)

	setup_target(vgmstream_wasm_min TRUE)

	install(TARGETS vgmstream_wasm_min
		RUNTIME DESTINATION ${CMAKE_INSTALL_PREFIX}/bin)
endif()

# TODO: Make it so vgmstream123 can build with Windows (this probably needs a libao.dll included with vgmstream, though)

if(NOT WIN32 AND BUILD_V123)
	# vgmstream123

	add_executable(vgmstream123
		vgmstream123.c wav_utils.c)

	# Link to the vgmstream library as well as libao
	target_link_libraries(vgmstream123 PUBLIC
		libvgmstream
		ao pthread dl)

	setup_target(vgmstream123 TRUE)

	# Add AO include directory
	target_include_directories(vgmstream123 PRIVATE
		${LIBAO_INCLUDE})

	# Include the version string
	target_compile_definitions(vgmstream123 PRIVATE VGMSTREAM_VERSION="${VGMSTREAM_VERSION}")
	
	if(CMAKE_CXX_COMPILER_ID MATCHES Clang OR CMAKE_CXX_COMPILER_ID MATCHES GNU)
		set_target_properties(vgmstream123 PROPERTIES LINK_FLAGS_RELEASE -s)
	endif()
	
	# Install vgmstream123
	install(TARGETS vgmstream123
		RUNTIME DESTINATION ${CMAKE_INSTALL_PREFIX}/bin)
endif()
