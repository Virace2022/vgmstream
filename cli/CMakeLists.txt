# CLI

add_executable(vgmstream_cli
	vgmstream_cli.c vgmstream_cli_utils.c wav_utils.c)

set_target_properties(vgmstream_cli PROPERTIES
	PREFIX ""
	OUTPUT_NAME "vgmstream-cli")

# Link to the vgmstream library
target_link_libraries(vgmstream_cli PUBLIC libvgmstream)


setup_target(vgmstream_cli TRUE)

if(WIN32)
	# Add the preprocessor definitions
	target_compile_definitions(vgmstream_cli PRIVATE _CONSOLE)

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

# TODO: Make it so vgmstream123 can build with Windows (this probably needs a libao.dll included with vgmstream, though)

set_mpeg(OFF TRUE)
set_vorbis(ON TRUE)
set_ffmpeg(OFF TRUE)

set(USE_G7221 OFF FORCE)
set(USE_G719 OFF FORCE)
set(USE_CELT OFF FORCE)
set(USE_SPEEX OFF FORCE)
