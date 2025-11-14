$(function () {
    'use strict';

    var ksh_send_input_string = null;
    var ksh_get_output_string = null;

    var board_size = 16;
    var board, board_update_defer, board_history;
    var move_cnt = 0;
    var undo_remain = 0;
    var cur_reply_cnt = 0;
    
    var pending_first_move = null;
    var game_moves = [];
    var game_config = {
        level: 'normal',
        first: 'human'
    };

    var game_status = $('#game_status');
    var panel_status = $('#panel_status');
    var btn_start = $('#btn_start').click(start_game);
    var btn_restart = $('#btn_restart').click(restart_game);
    var btn_undo = $('#btn_undo').click(undo_game);
    var ai_logs = document.getElementById('ai_logs');
    var btn_showmoves = $('#btn_showmoves').click(game_showmoves);
    var btn_prevmove = $('#btn_prevmove').click(game_prevmove);
    var btn_nextmove = $('#btn_nextmove').click(game_nextmove);
    var panel_gamearea = document.getElementById('panel_gamearea');
    var ai_msg = $('#ai_msg');
    var div_pb_outer = $('#div_pb_outer');
    var div_pb_inner = $('#div_pb_inner');

    function on_loaded_wasm() {
        Module._ksh_start();
        ksh_send_input_string = Module.cwrap('ksh_send_input', null, ['string']);
        ksh_get_output_string = Module.cwrap('ksh_get_output', 'string', null);

        btn_start.prop('disabled', false);
        $('#btn_download_logs').show();
        update_ws_status('Connected', '#00c853');
        
        startGameFromURLParams();

        setInterval(function () {
            var output = ksh_get_output_string();
            if (output.length === 0) {
                return;
            }
            var cmd = output.split(' ');
            switch (cmd[0]) {
                case 'START':
                    server_start();
                    break;
                case 'AI':
                    server_ai_turn(parseInt(cmd[1]), parseInt(cmd[2]));
                    break;
                case 'HM':
                    server_human_turn(parseInt(cmd[1]), parseInt(cmd[2]));
                    break;
                case 'WIN':
                    server_win(cmd);
                    break;
                case 'UNDO':
                    server_undo(parseInt(cmd[1]), parseInt(cmd[2]),
                        parseInt(cmd[3]), parseInt(cmd[4]),
                        parseInt(cmd[5]), parseInt(cmd[6]));
                    break;
                case 'UNDOR':
                    server_undo_remain(parseInt(cmd[1]));
                    break;
                case 'STT':
                    server_stt(output.substr(4));
                    break;
                case 'PB':
                    server_progress(parseInt(cmd[1]));
                    break;
                case 'L':
                    server_log(output.substr(2));
                    break;
                case 'MSG':
                    server_msg(output.substr(4));
                    break;
                case 'LOGCLR':
                    ai_logs.value = '';
                    ai_msg.text('');
                    break;
            }
        }, 25);
    };
    if (window.ksh_loaded_wasm) {
        on_loaded_wasm();
    } else {
        window.ksh_on_loaded_wasm = on_loaded_wasm;
    }

    function server_start() {
        set_panel_state(true);
        btn_start.prop('disabled', false);
        btn_restart.prop('disabled', false);
        btn_undo.prop('disabled', false);
        btn_showmoves.hide(0); btn_prevmove.hide(0); btn_nextmove.hide(0);

        board = []; board_update_defer = []; board_history = [];
        move_cnt = 0;
        for (var i = 0; i < board_size; i++) {
            board.push([]);
            for (var j = 0; j < board_size; j++)
                board[i].push({ empty: true });
        }

        init_board();
        render_board(null, null, true);
        
        if (pending_first_move !== null) {
            const coords = get_coords_from_cell_number(pending_first_move);
            if (coords && coords.r >= 0 && coords.r < board_size && coords.c >= 0 && coords.c < board_size) {
                socket_send("HM " + coords.r + " " + coords.c);
            }
            pending_first_move = null;
        }
    }

    function new_piece(x, y, p, no) {
        render_board([{
            x: x, y: y, change: {
                empty: false,
                piece: p,
                new_move: true,
                move_num: no
            }
        }], [{
            x: x, y: y, change: {
                new_move: false
            }
        }]);
        board_history.push({ x: x, y: y, piece: p });
        
        var cellNum = get_cell_number(x, y);
        game_moves.push(cellNum);
        updateMovesDisplay();
    }

    function server_ai_turn(x, y) {
        new_piece(x, y, 1, ++move_cnt);
    }
    function server_human_turn(x, y) {
        new_piece(x, y, 2, ++move_cnt);
    }
    function server_stt(stt) {
        game_status.text(stt);
    }
    var progress_on = false;
    function server_progress(time) {
        div_pb_inner.stop();
        if (time > 0) {
            progress_on = true;
            btn_restart.prop('disabled', true);
            btn_undo.prop('disabled', true);
            div_pb_inner.width('0%');
            div_pb_inner.attr('aria-valuenow', 0);
            div_pb_outer.animate({ 'opacity': 1 }, { duration: 300, queue: false });
            div_pb_inner.animate({ 'width': '100%', 'aria-valuenow': 100 }, { duration: time, easing: 'linear', queue: false });
        } else {
            progress_on = false;
            btn_restart.prop('disabled', false);
            if (undo_remain > 0) btn_undo.prop('disabled', false);
            div_pb_inner.animate({ 'width': '100%', 'aria-valuenow': 100 }, { duration: 250, queue: false });
            div_pb_outer.animate({ 'opacity': 0 }, { duration: 300, queue: false });
        }
    }
    function server_log(log) {
        ai_logs.value = log + '\r\n' + ai_logs.value;
    }
    function server_msg(msg) {
        ai_msg.text(msg);
    }
    function server_undo_remain(remain) {
        undo_remain = remain;
        btn_undo.text('Undo (' + remain + ')');
        btn_undo.prop('disabled', remain === 0);
    }
    function server_undo(x1, y1, x2, y2, xlast, ylast) {
        var up = [], defer = [];
        if (x1 !== -1 && y1 !== -1) {
            up.push({ x: x1, y: y1, change: { empty: true, undo_move: true } });
            defer.push({ x: x1, y: y1, change: { undo_move: false } });
        }
        if (x2 !== -1 && y2 !== -1) {
            up.push({ x: x2, y: y2, change: { empty: true, undo_move: true } });
            defer.push({ x: x2, y: y2, change: { undo_move: false } });
        }
        if (xlast !== -1 && ylast !== -1) {
            up.push({ x: xlast, y: ylast, change: { new_move: true } });
            defer.push({ x: xlast, y: ylast, change: { new_move: false } });
        }
        
        if (x1 !== -1 && y1 !== -1) {
            game_moves.pop();
        }
        if (x2 !== -1 && y2 !== -1) {
            game_moves.pop();
        }
        updateMovesDisplay();
        
        render_board(up, defer);
    }
    function server_win(cmd) {
        cmd = cmd.map(function (x) { return parseInt(x); });
        var up = [], defer = [];
        for (var i = 1; i < 10; i += 2) {
            up.push({ x: cmd[i], y: cmd[i + 1], change: { win_move: true } });
            defer.push({ x: cmd[i], y: cmd[i + 1], change: { win_move: false } });
        }
        btn_undo.prop('disabled', true);
        render_board(up, defer);
        btn_showmoves.show(200);
    }

    function update_ws_status(status, statusColor) {
        $('.ws_indicator, .ws_status').show(0);
        $('.ws_indicator').css('background-color', statusColor);
        $('.ws_status').text(status);
    }

    function socket_send(msg) {
        if (!progress_on)
            ksh_send_input_string(msg);
    }

    function start_game() {
        btn_start.prop('disabled', true);
        ai_logs.value = '';
        var variant = $('input[name="ai-select"]:checked').val();
        var level = $('input[name="ai-level"]:checked').val();
        var pf = $('input[name="play-first"]:checked').val();
        
        var levelMap = {
            'lv1': 'chicken',
            'lv2': 'easy',
            'lv3': 'normal',
            'lv4': 'medium',
            'lv5': 'hard',
            'lv6': 'fuck_me'
        };
        
        game_config.level = levelMap[level] || 'normal';
        game_config.first = pf === '1' ? 'human' : 'ai';
        game_moves = [];
        
        updateMovesDisplay();
        
        socket_send('START ' + variant + ' ' + level + ' ' + pf);
    }
    function restart_game() {
        set_panel_state(false);
    }
    function undo_game() {
        socket_send('UNDO');
    }
    function set_panel_state(play) {
        (!play ? $('#row_play') : $('#row_setting')).hide(400);
        (play ? $('#row_play') : $('#row_setting')).show(400, function () {
            if (play) {
                $('html, body').animate({
                    scrollTop: $("#row_play").offset().top
                }, 200);
            }
        });
    }
    function game_showmoves() {
        btn_showmoves.hide(200);
        $('#btn_prevmove, #btn_nextmove').show(200);
        render_board(null, null, { disp_num: true });
        cur_reply_cnt = move_cnt;
    }
    function game_prevmove() {
        if (cur_reply_cnt > 0) {
            cur_reply_cnt--;
            var move = board_history[cur_reply_cnt];
            render_board([{ x: move.x, y: move.y, change: { empty: true } }]);
        }
    }
    function game_nextmove() {
        if (cur_reply_cnt < move_cnt) {
            var move = board_history[cur_reply_cnt];
            render_board([{ x: move.x, y: move.y, change: { empty: false } }]);
            cur_reply_cnt++;
        }
    }

    function updateMovesDisplay() {
        var dataDiv = document.getElementById('game-data-crawler');
        if (!dataDiv) {
            dataDiv = document.createElement('div');
            dataDiv.id = 'game-data-crawler';
            dataDiv.style.display = 'none';
            document.body.appendChild(dataDiv);
        }
        
        dataDiv.setAttribute('data-level', game_config.level);
        dataDiv.setAttribute('data-first', game_config.first);
        dataDiv.setAttribute('data-moves', game_moves.join(','));
        dataDiv.setAttribute('data-move-count', game_moves.length);
        
        dataDiv.innerHTML = JSON.stringify({
            level: game_config.level,
            first: game_config.first,
            moves: game_moves,
            moveCount: game_moves.length,
            boardSize: board_size
        });
    }

    function startGameFromURLParams() {
        const params = new URLSearchParams(window.location.search);
        const firstPlayer = params.get('first');
        const level = params.get('level');
        const movesParam = params.get('moves');

        if (!firstPlayer && !level) {
            return;
        }

        if (firstPlayer === 'human') {
            $('#human_first').prop('checked', true);
        } else if (firstPlayer === 'ai') {
            $('#ai_first').prop('checked', true);
        }

        if (level) {
            let levelID = 'lv3';
            switch (level.toLowerCase()) {
                case 'chicken': levelID = 'lv1'; break;
                case 'easy':    levelID = 'lv2'; break;
                case 'normal':  levelID = 'lv3'; break;
                case 'medium':  levelID = 'lv4'; break;
                case 'hard':    levelID = 'lv5'; break;
                case 'fuck_me': levelID = 'lv6'; break;
            }
            $(`input[name='ai-level'][id='${levelID}']`).prop('checked', true);
        }

        if (firstPlayer === 'human' && movesParam) {
            const moves = movesParam.split(',').map(m => parseInt(m.trim(), 10)).filter(m => !isNaN(m));
            if (moves.length > 0) {
                pending_first_move = moves[0];
            }
        }

        start_game();
    }

    document.onkeydown = function (e) {
        var enable = btn_prevmove.css('display') !== 'none';
        switch (e.keyCode) {
            case 37: 
            case 38: 
                if (enable) { game_prevmove(); e.preventDefault(); }
                break;
            case 39: 
            case 40: 
                if (enable) { game_nextmove(); e.preventDefault(); }
                break;
        }
    };

    function get_cell_number(r, c) {
        return r * board_size + c + 1;
    }
    
    function get_coords_from_cell_number(cell_num) {
        if (cell_num < 1 || cell_num > board_size * board_size) {
            return null;
        }
        var num = cell_num - 1;
        var r = Math.floor(num / board_size);
        var c = num % board_size;
        return { r: r, c: c };
    }

    var svg_lines = [
        '', 
        '', 
        '', 
        '', 
        '<line x1="35%" y1="50%" x2="65%" y2="50%" style="stroke:rgb(255,0,0); stroke-width:2px;" />' +
        '<line x1="50%" y1="35%" x2="50%" y2="65%" style="stroke:rgb(255,0,0); stroke-width:2px;" />'
    ];
    var svg_circles = [
        '<use xlink:href="#white_piece" />',
        '<use xlink:href="#black_piece" />'
    ];
    
    var svg_highlight = [
        '<circle cx="50%" cy="50%" r="45%" style="fill:none; stroke:orange; stroke-width:3px; stroke-opacity:0.8;" />'
    ];

    var svg_number_tag = '<text x="50%" y="52%" alignment-baseline="middle" text-anchor="middle" font-weight="bold" font-size="35%">';

    var tbl_board = document.getElementById('tbl_board');
    var div_gamearea = document.getElementById('div_gamearea');

    function render_cell(x, y) {
        var cell = tbl_board.rows[x].cells[y];
        var data = board[x][y];
        var svg = '<svg style="display: block; width: 100%; height: 100%;" ' +
            'xmlns:svg="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg" ' +
            'xmlns:xlink="http://www.w3.org/1999/xlink">';

        var cell_num = get_cell_number(x, y);
        var text_color = '#555'; 

        if (!data.empty) {
            if (data.piece) svg += svg_circles[data.piece - 1];

            text_color = data.piece === 1 ? '#fff' : '#333';
            
            if (data.new_move) {
                svg += svg_highlight[0]; 
            }
            
            if (data.win_move) svg += svg_lines[4]; 
            
            if (data.piece && data.move_num && data.disp_num) {
                var move_num_color = data.piece === 1 ? '#e2e2e2' : '#777'; 
                var move_num_size = Math.min(cell.offsetWidth, cell.offsetHeight) * 0.28;
                svg += '<text x="50%" y="50%" fill="' + move_num_color + '" dominant-baseline="middle" text-anchor="middle" font-weight="bold" font-size="' + move_num_size + 'px">' + data.move_num + '</text>';
            }
        }
        
        svg += svg_number_tag + '<tspan fill="' + text_color + '">' + cell_num + '</tspan></text>';
        
        if (data.undo_move) svg += svg_lines[4]; 

        cell.innerHTML = svg + '</svg>';
    }
    
    function apply_update(up) {
        if (!up) return;
        up.forEach(function (elem) {
            var data = board[elem.x][elem.y];
            for (var name in elem.change) { data[name] = elem.change[name]; }
            render_cell(elem.x, elem.y);
        });
    }
    function render_board(update, update_defer, change_all) {
        apply_update(board_update_defer);
        apply_update(update);
        board_update_defer = update_defer;

        if (change_all) {
            if (typeof change_all === 'object') {
                for (var r = 0; r < board_size; r++)
                    for (var c = 0; c < board_size; c++)
                        for (var name in change_all)
                            board[r][c][name] = change_all[name];
            }
            rerender_all();
        }
    }
    function rerender_all() {
        for (var r = 0; r < board_size; r++)
            for (var c = 0; c < board_size; c++)
                render_cell(r, c);
    }

    function init_board() {
        var container_size = panel_gamearea.offsetWidth - 32;

        var cell_width = Math.floor(container_size / board_size);
        var cell_height = Math.floor(container_size / board_size);

        cell_width -= cell_width % 2;
        cell_height -= cell_height % 2;

        div_gamearea.style.width = cell_width * board_size + 'px';
        div_gamearea.style.height = cell_height * board_size + 'px';

        tbl_board.innerHTML = "";
        for (var r = 0; r < board_size; r++) {
            var row = tbl_board.insertRow();
            for (var c = 0; c < board_size; c++) {
                var cell = row.insertCell();
                cell.r = r; cell.c = c;
                cell.board_data = 0;

                cell.width = cell_width; cell.height = cell_height;
                cell.style.padding = '0';
                cell.style.verticalAlign = 'bottom';
                
                cell.style.border = '1px solid #777'; 
                cell.style.backgroundColor = '#f4f0dc'; 

                cell.addEventListener("click", tblBoardOnClick);
            }
        }
    }

    function tblBoardOnClick(e) {
        var r = e.currentTarget.r, c = e.currentTarget.c;
        socket_send("HM " + r + " " + c);
    }

    $(window).resize(function () {
        init_board();
        rerender_all();
    });

    function offerFileAsDownload(filename, mime) {
        mime = mime || 'application/octet-stream';

        let content = FS.readFile(filename);

        var a = document.createElement('a');
        a.download = 'ksh.csv';
        a.href = URL.createObjectURL(new Blob([content], { type: mime }));
        a.style.display = 'none';

        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        }, 2000);
    }

    $('#btn_download_logs').hide().click(function (event) {
        event.preventDefault();
        if (FS) {
            offerFileAsDownload('/persistent_data/ksh.csv', 'text/csv');
        }
    });

    $('#row_setting, #row_play').hide();
    set_panel_state(false);
    
    // Đảm bảo bàn cờ được khởi tạo ngay cả khi không có sự kiện resize hay wasm load ngay lập tức
    init_board();
    rerender_all();
});
