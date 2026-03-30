file(GLOB BASE_HEADERS "${CMAKE_CURRENT_SOURCE_DIR}/base/*.h")
file(GLOB BASE_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/base/*.c")
list(REMOVE_ITEM BASE_SOURCES
	${CMAKE_CURRENT_SOURCE_DIR}/base/codec_info_wasm_min.c)
file(GLOB CODING_HEADERS "${CMAKE_CURRENT_SOURCE_DIR}/coding/*.h")
file(GLOB CODING_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/coding/*.c")
file(GLOB CLIBS_HEADERS "${CMAKE_CURRENT_SOURCE_DIR}/coding/libs/*.h")
file(GLOB CLIBS_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/coding/libs/*.c")
file(GLOB LAYOUT_HEADERS "${CMAKE_CURRENT_SOURCE_DIR}/layout/*.h")
file(GLOB LAYOUT_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/layout/*.c")
file(GLOB META_HEADERS "${CMAKE_CURRENT_SOURCE_DIR}/meta/*.h")
file(GLOB META_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/meta/*.c")
file(GLOB UTIL_HEADERS "${CMAKE_CURRENT_SOURCE_DIR}/util/*.h")
file(GLOB UTIL_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/util/*.c")
set(EXT_HEADERS
	${VGM_SOURCE_DIR}/ext_includes/pstdint.h)
file(GLOB MAIN_HEADERS "${CMAKE_CURRENT_SOURCE_DIR}/*.h")
file(GLOB MAIN_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/*.c")

set(WASM_MIN_PRIVATE_SOURCES
	${CMAKE_CURRENT_SOURCE_DIR}/vgmstream_wasm_min.c
	${CMAKE_CURRENT_SOURCE_DIR}/vgmstream_init_wasm_min.c
	${CMAKE_CURRENT_SOURCE_DIR}/vgmstream_wasm_min_runtime.c)
list(REMOVE_ITEM MAIN_SOURCES ${WASM_MIN_PRIVATE_SOURCES})

# Setup source groups, mainly for Visual Studio
source_group("Header Files\\base" FILES ${BASE_HEADERS})
source_group("Header Files\\coding" FILES ${CODING_HEADERS})
source_group("Header Files\\coding\\libs" FILES ${CLIBS_HEADERS})
source_group("Header Files\\layout" FILES ${LAYOUT_HEADERS})
source_group("Header Files\\meta" FILES ${META_HEADERS})
source_group("Header Files\\util" FILES ${UTIL_HEADERS})
source_group("Header Files\\ext" FILES ${EXT_HEADERS})

source_group("Source Files\\base" FILES ${BASE_SOURCES})
source_group("Source Files\\coding" FILES ${CODING_SOURCES})
source_group("Source Files\\coding\\libs" FILES ${CLIBS_SOURCES})
source_group("Source Files\\layout" FILES ${LAYOUT_SOURCES})
source_group("Source Files\\meta" FILES ${META_SOURCES})
source_group("Source Files\\util" FILES ${UTIL_SOURCES})

set(libvgmstream_sources
	${BASE_SOURCES}
	${CODING_SOURCES}
	${CLIBS_SOURCES}
	${LAYOUT_SOURCES}
	${META_SOURCES}
	${UTIL_SOURCES}
	${MAIN_SOURCES}
	${EXT_HEADERS}
)
set(libvgmstream_headers
	${BASE_HEADERS}
	${CODING_HEADERS}
	${CLIBS_HEADERS}
	${LAYOUT_HEADERS}
	${META_HEADERS}
	${UTIL_HEADERS}
	${MAIN_HEADERS}
)
# Set up the proper include directories
set(libvgmstream_includes
	${VGM_SOURCE_DIR}/ext_includes
	base
	coding
	layout
	meta
	util
)

# libvgmstream.a
add_library(libvgmstream STATIC ${libvgmstream_sources} ${libvgmstream_headers})
set_target_properties(libvgmstream PROPERTIES PREFIX "")

if(USE_FFMPEG AND FFMPEG_COMPILE)
	add_dependencies(libvgmstream avcodec)
endif()

setup_target(libvgmstream)

target_include_directories(libvgmstream PRIVATE ${libvgmstream_includes})

set(libvgmstream_wasm_min_main_sources
	${MAIN_SOURCES}
	${CMAKE_CURRENT_SOURCE_DIR}/vgmstream_init_wasm_min.c
	${CMAKE_CURRENT_SOURCE_DIR}/vgmstream_wasm_min_runtime.c)
list(REMOVE_ITEM libvgmstream_wasm_min_main_sources
	${CMAKE_CURRENT_SOURCE_DIR}/vgmstream_init.c
	${CMAKE_CURRENT_SOURCE_DIR}/vgmstream.c)

set(libvgmstream_wasm_min_base_sources
	${BASE_SOURCES}
	${CMAKE_CURRENT_SOURCE_DIR}/base/codec_info_wasm_min.c)
list(REMOVE_ITEM libvgmstream_wasm_min_base_sources
	${CMAKE_CURRENT_SOURCE_DIR}/base/api_decode_base.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/api_decode_open.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/api_decode_play.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/api_helpers.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/api_libsf.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/api_libsf_cache.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/api_tags.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/codec_info.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/decode.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/info.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/mixer.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/mixer_ops_common.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/mixer_ops_fade.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/mixing.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/mixing_commands.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/mixing_macros.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/play_config.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/play_state.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/plugins.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/render.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/resampler.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/seek.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/tags.c
	${CMAKE_CURRENT_SOURCE_DIR}/base/streamfile_stdio.c)

set(libvgmstream_wasm_min_meta_sources
	${CMAKE_CURRENT_SOURCE_DIR}/meta/wwise.c)

set(libvgmstream_wasm_min_layout_sources)

set(libvgmstream_wasm_min_util_sources
	${UTIL_SOURCES})
list(REMOVE_ITEM libvgmstream_wasm_min_util_sources
	${CMAKE_CURRENT_SOURCE_DIR}/util/layout_utils.c)

set(libvgmstream_wasm_min_root_sources
	${libvgmstream_wasm_min_main_sources}
	${CMAKE_CURRENT_SOURCE_DIR}/streamfile.c
	${CMAKE_CURRENT_SOURCE_DIR}/util.c
	${CMAKE_CURRENT_SOURCE_DIR}/vgmstream_wasm_min_runtime.c)
list(REMOVE_ITEM libvgmstream_wasm_min_root_sources
	${CMAKE_CURRENT_SOURCE_DIR}/formats.c)

set(libvgmstream_wasm_min_sources
	${libvgmstream_wasm_min_base_sources}
	${CODING_SOURCES}
	${CLIBS_SOURCES}
	${libvgmstream_wasm_min_layout_sources}
	${libvgmstream_wasm_min_meta_sources}
	${libvgmstream_wasm_min_util_sources}
	${libvgmstream_wasm_min_root_sources}
	${EXT_HEADERS}
)

add_library(libvgmstream_wasm_min STATIC ${libvgmstream_wasm_min_sources} ${libvgmstream_headers})
set_target_properties(libvgmstream_wasm_min PROPERTIES PREFIX "")
target_compile_definitions(libvgmstream_wasm_min PRIVATE VGM_WASM_MIN)

if(USE_FFMPEG AND FFMPEG_COMPILE)
	add_dependencies(libvgmstream_wasm_min avcodec)
endif()

setup_target(libvgmstream_wasm_min)
target_include_directories(libvgmstream_wasm_min PRIVATE ${libvgmstream_includes})

add_library(vgmstream_wasm_min_core STATIC
	vgmstream_wasm_min.c
	${VGM_SOURCE_DIR}/cli/wav_utils.c
	vgmstream_wasm_min.h)
set_target_properties(vgmstream_wasm_min_core PROPERTIES PREFIX "")
target_compile_definitions(vgmstream_wasm_min_core PRIVATE VGM_WASM_MIN)
target_link_libraries(vgmstream_wasm_min_core PUBLIC libvgmstream_wasm_min)
target_include_directories(vgmstream_wasm_min_core PRIVATE ${libvgmstream_includes})
target_include_directories(vgmstream_wasm_min_core PRIVATE ${VGM_SOURCE_DIR}/cli)
setup_target(vgmstream_wasm_min_core)

# libvgmstream.so
if(BUILD_SHARED_LIBS)
	include(GNUInstallDirs)

	add_library(libvgmstream_shared SHARED ${libvgmstream_sources} ${libvgmstream_headers})
	target_include_directories(libvgmstream_shared INTERFACE $<INSTALL_INTERFACE:include>)
	set_target_properties(libvgmstream_shared PROPERTIES
		PREFIX ""
		OUTPUT_NAME "libvgmstream"
		EXPORT_NAME "vgmstream"
		PUBLIC_HEADER "${libvgmstream_headers}"
	)
	
	if(USE_FFMPEG AND FFMPEG_COMPILE)
		add_dependencies(libvgmstream_shared avcodec)
	endif()
	
	setup_target(libvgmstream_shared TRUE)
	
	target_include_directories(libvgmstream_shared PRIVATE ${libvgmstream_includes})

	install(TARGETS libvgmstream_shared EXPORT vgmstream-targets PUBLIC_HEADER DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}/vgmstream)
	install(EXPORT vgmstream-targets FILE vgmstream-targets.cmake NAMESPACE vgmstream:: DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/vgmstream)
	include(CMakePackageConfigHelpers)
	configure_package_config_file(${CMAKE_CURRENT_SOURCE_DIR}/vgmstream-config.cmake.in
		"${CMAKE_CURRENT_BINARY_DIR}/vgmstream-config.cmake"
		INSTALL_DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/vgmstream
	)
	install(
		FILES "${CMAKE_CURRENT_BINARY_DIR}/vgmstream-config.cmake"
		DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/vgmstream
	)
endif()
