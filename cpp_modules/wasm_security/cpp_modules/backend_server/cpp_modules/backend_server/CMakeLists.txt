cmake_minimum_required(VERSION 3.14)
project(PepelZvezdTicketServer VERSION 1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(CURL REQUIRED)
find_package(Threads REQUIRED)

add_executable(ticket_server server.cpp)
target_link_libraries(ticket_server PRIVATE CURL::libcurl Threads::Threads)
target_compile_options(ticket_server PRIVATE -O3 -Wall -Wextra)
